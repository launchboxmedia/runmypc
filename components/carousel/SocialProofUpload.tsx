'use client'
import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  onUpload: (url: string) => void
  onClear: () => void
  uploadedUrl: string | null
}

export function SocialProofUpload({ onUpload, onClear, uploadedUrl }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function uploadFile(file: File) {
    if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
      setError('PNG or JPG only.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Max 10MB.')
      return
    }
    setError('')
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const ext = file.name.split('.').pop()
      const path = `${user.id}/proof/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('job-assets')
        .upload(path, file, { contentType: file.type, upsert: true })
      if (uploadError) throw uploadError
      const { data } = await supabase.storage
        .from('job-assets')
        .createSignedUrl(path, 3600 * 24) // 24h — enough for the run
      if (data?.signedUrl) onUpload(data.signedUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  if (uploadedUrl) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-3 uppercase tracking-widest">
          Social Proof Asset
        </label>
        <div className="relative border border-gray-700 p-3 flex items-center gap-4">
          <img
            src={uploadedUrl}
            alt="Proof"
            className="w-16 h-16 object-cover border border-gray-700"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-300 font-medium">Proof image ready</p>
            <p className="text-xs text-gray-600 mt-0.5">Will render inside .premium-proof-frame</p>
          </div>
          <button
            type="button"
            onClick={() => { onClear(); if (inputRef.current) inputRef.current.value = '' }}
            className="text-gray-600 hover:text-white text-xs font-bold uppercase tracking-widest px-3 py-2 border border-gray-700 hover:border-gray-500 transition-all"
          >
            Remove
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-3 uppercase tracking-widest">
        Social Proof Asset <span className="text-gray-600 normal-case">(optional)</span>
      </label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={uploading}
        className={`w-full border-2 border-dashed p-8 flex flex-col items-center gap-3 transition-all ${
          dragging
            ? 'border-[#E8622A] bg-[#E8622A]/5'
            : 'border-gray-700 hover:border-gray-500'
        } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ borderRadius: 0 }}
      >
        <div className="w-10 h-10 border border-gray-700 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-gray-500">
            <path d="M4 16l4-4 4 4 4-6 4 6" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="3" y="3" width="18" height="18" rx="0"/>
          </svg>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {uploading ? 'Uploading…' : 'Drop screenshot or click to browse'}
          </p>
          <p className="text-xs text-gray-600 mt-1">PNG or JPG · Max 10MB</p>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={onFileChange}
      />
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}
