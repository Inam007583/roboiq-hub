'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Session, Student, StudentFieldValue } from '@/lib/types'
import Link from 'next/link'

export default function SessionDetail() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [session, setSession] = useState<Session | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [driveLink, setDriveLink] = useState('')
  const [loading, setLoading] = useState(true)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([])

  const sessionId = params.id as string

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      

      const { data: sessionData } = await supabase
        .from('sessions')
        .select(`*, venues ( name, brand, requires_photos )`)
        .eq('id', sessionId)
        .single()

      const { data: studentsData } = await supabase
        .from('students')
        .select('*')
        .eq('session_id', sessionId)
        .order('full_name')

      setSession(sessionData)
setStudents(studentsData || [])
setDriveLink(sessionData?.photo_drive_link || '')

// Load existing photos from storage
const { data: photos } = await supabase.storage
  .from('session-photos')
  .list(sessionId)

if (photos) {
  const urls = photos.map(photo => {
    const { data } = supabase.storage
      .from('session-photos')
      .getPublicUrl(`${sessionId}/${photo.name}`)
    return data.publicUrl
  })
  setUploadedPhotos(urls)
}

setLoading(false)
    }
    loadData()
  }, [sessionId])
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const files = e.target.files
  if (!files || files.length === 0) return

  setUploading(true)

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const fileName = `${Date.now()}-${file.name}`
    const filePath = `${sessionId}/${fileName}`

    const { error } = await supabase.storage
      .from('session-photos')
      .upload(filePath, file)

    if (error) {
      alert(`Upload failed: ${error.message}`)
      continue
    }

    const { data } = supabase.storage
      .from('session-photos')
      .getPublicUrl(filePath)

    setUploadedPhotos(prev => [...prev, data.publicUrl])
  }

  setUploading(false)
  e.target.value = ''
}

async function handleDeletePhoto(photoUrl: string) {
  if (!confirm('Delete this photo?')) return

  const urlParts = photoUrl.split('/session-photos/')
  if (urlParts.length < 2) return
  const filePath = urlParts[1]

  const { error } = await supabase.storage
    .from('session-photos')
    .remove([filePath])

  if (error) {
    alert(`Delete failed: ${error.message}`)
    return
  }

  setUploadedPhotos(prev => prev.filter(p => p !== photoUrl))
}

  function updateStudent(studentId: string, field: string, value: StudentFieldValue) {
    setStudents(students.map(s =>
      s.id === studentId ? { ...s, [field]: value } : s
    ))
  }

  async function handleSubmitStudent(student: Student) {
    if (session?.venues?.requires_photos && !driveLink.trim()) {
      alert('Photo link is required before sending feedback for this venue.')
      return
    }
    if (!student.parent_email || !student.parent_email.trim()) {
      alert(`No parent email on file for ${student.full_name || 'this student'}. Add one before sending.`)
      return
    }

    setSendingId(student.id)

    // 1. Save this student's feedback
    const { error: saveError } = await supabase
      .from('students')
      .update({
        attended: student.attended,
        lesson_focus: student.lesson_focus,
        level: student.level,
        day_number: student.day_number,
        is_repeat: student.is_repeat,
        understanding_score: student.understanding_score,
        time_intro_score: student.time_intro_score,
        time_build_score: student.time_build_score,
        time_play_score: student.time_play_score,
        troubleshooting_score: student.troubleshooting_score,
        design_score: student.design_score,
        learn_more_about: student.learn_more_about,
        what_learned_today: student.what_learned_today,
        instructor_remarks: student.instructor_remarks,
      })
      .eq('id', student.id)

    if (saveError) {
      alert(`Could not save feedback: ${saveError.message}`)
      setSendingId(null)
      return
    }

    // Persist the photo link (if any) at the session level
    if (driveLink.trim()) {
      await supabase
        .from('sessions')
        .update({ photo_drive_link: driveLink })
        .eq('id', sessionId)
    }

    // 2. Format + email the parent
    const res = await fetch('/api/send-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id }),
    })
    const result = await res.json()

    if (!res.ok) {
      alert(`Feedback saved, but the email failed: ${result.error || res.statusText}`)
      setSendingId(null)
      return
    }

    // 3. Mark this student as sent locally
    const updated = students.map(s =>
      s.id === student.id ? { ...s, feedback_sent_at: result.sentAt } : s
    )
    setStudents(updated)
    setSendingId(null)

    // 4. If every student has now been sent, mark the session completed
    if (updated.every(s => s.feedback_sent_at)) {
      await supabase.from('sessions').update({ status: 'completed' }).eq('id', sessionId)
      setSession(prev => (prev ? { ...prev, status: 'completed' } : prev))
    }

    alert(`Feedback sent to ${student.parent_email}.`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Session not found.</p>
      </div>
    )
  }

  const requiresPhotos = session.venues?.requires_photos
  const isCompleted = session.status === 'completed'

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block">
          ← Back to Dashboard
        </Link>

        {/* Session header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>
              <p className="text-gray-600 mt-1">{session.date} at {session.time}</p>
              <p className="text-gray-600">{session.venues?.name}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              isCompleted ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'
            }`}>
              {isCompleted ? 'Completed' : 'Upcoming'}
            </span>
          </div>
        </div>
        {/* Photo Upload Section */}
<div className="bg-white rounded-xl shadow-sm p-6 mb-6">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-semibold text-gray-900">
      Session Photos ({uploadedPhotos.length})
    </h2>
    {!isCompleted && (
      <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
        {uploading ? 'Uploading...' : '+ Upload Photos'}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoUpload}
          disabled={uploading}
          className="hidden"
        />
      </label>
    )}
  </div>

  {uploadedPhotos.length === 0 && (
    <p className="text-gray-400 text-sm text-center py-8">
      No photos uploaded yet. Click &ldquo;Upload Photos&rdquo; to add session pictures.
    </p>
  )}

  {uploadedPhotos.length > 0 && (
    <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
      {uploadedPhotos.map((url, i) => (
        <div key={i} className="relative group aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Session photo ${i + 1}`}
            className="w-full h-full object-cover rounded-lg border border-gray-200"
          />
          {!isCompleted && (
            <button
              onClick={() => handleDeletePhoto(url)}
              className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition"
              title="Delete photo"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )}
</div>

        {/* Drive link for venues that require photos */}
        {requiresPhotos && (
          <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-5 mb-6">
            <label className="block text-sm font-semibold text-purple-900 mb-2">
              Photo Folder Link (required)
            </label>
            <input
              type="url"
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              disabled={isCompleted}
              className="w-full px-4 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 text-gray-900"
            />
            <p className="text-xs text-purple-700 mt-2">
              Upload photos to a Google Drive folder, set sharing to &ldquo;Anyone with the link&rdquo;, and paste the URL here.
            </p>
          </div>
        )}

        {/* Students list */}
        <h2 className="text-xl font-semibold mb-4 text-gray-900">
          Students ({students.length})
        </h2>

        <div className="space-y-4">
          {students.map((student) => (
            <StudentFeedbackCard
              key={student.id}
              student={student}
              isExpanded={expandedStudent === student.id}
              sending={sendingId === student.id}
              onToggle={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
              onChange={(field: string, value: StudentFieldValue) => updateStudent(student.id, field, value)}
              onSubmit={() => handleSubmitStudent(student)}
            />
          ))}
        </div>

        {students.length > 0 && students.every(s => s.feedback_sent_at) && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center mt-6">
            <p className="text-green-800 font-medium">All feedback sent for this session</p>
          </div>
        )}
      </div>
    </main>
  )
}

// ===== STUDENT FEEDBACK CARD =====
function StudentFeedbackCard({
  student,
  isExpanded,
  sending,
  onToggle,
  onChange,
  onSubmit,
}: {
  student: Student
  isExpanded: boolean
  sending: boolean
  onToggle: () => void
  onChange: (field: string, value: StudentFieldValue) => void
  onSubmit: () => void
}) {
  const isSent = !!student.feedback_sent_at
  const sentDate = student.feedback_sent_at
    ? new Date(student.feedback_sent_at).toLocaleDateString()
    : ''

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Top row */}
      <div className="p-4 flex items-center justify-between">
        <label className="flex items-center gap-3 cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={student.attended || false}
            onChange={(e) => onChange('attended', e.target.checked)}
            disabled={isSent}
            className="w-5 h-5 accent-indigo-600"
          />
          <span className="font-semibold text-lg text-gray-900">{student.full_name}</span>
          {isSent && (
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
              Sent {sentDate}
            </span>
          )}
        </label>
        <button
          onClick={onToggle}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 px-3 py-1 rounded-lg hover:bg-indigo-50"
        >
          {isExpanded ? '▲ Hide feedback' : '▼ Add feedback'}
        </button>
      </div>

      {/* Expanded feedback form */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-5 bg-gray-50/40 space-y-5">

          {/* Header fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Lesson Focus" value={student.lesson_focus} onChange={(v: string) => onChange('lesson_focus', v)} disabled={isSent} placeholder="e.g. Sphero Robot" />
            <Field label="Level" value={student.level} onChange={(v: string) => onChange('level', v)} disabled={isSent} placeholder="e.g. Beginner" />
            <Field label="Day" value={student.day_number} onChange={(v: string) => onChange('day_number', v)} disabled={isSent} placeholder="e.g. 5" />
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={student.is_repeat || false}
                  onChange={(e) => onChange('is_repeat', e.target.checked)}
                  disabled={isSent}
                  className="w-4 h-4 accent-indigo-600"
                />
                <span className="text-sm font-medium text-gray-700">Repeat</span>
              </label>
            </div>
          </div>

          {/* 1. Understanding of Instructions */}
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <p className="text-sm font-bold text-gray-900 mb-2">1. Understanding of Instructions</p>
            <StarRating value={student.understanding_score} onChange={(v: number) => onChange('understanding_score', v)} disabled={isSent} />
            <p className="text-xs text-gray-500 mt-2">1 = Challenging · 3 = Good Work · 5 = Ur a Star!</p>
          </div>

          {/* 2. Time Management */}
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <p className="text-sm font-bold text-gray-900 mb-3">2. Time Management</p>
            <div className="grid grid-cols-3 gap-3">
              <SubScore label="Intro & Pre-built" value={student.time_intro_score} onChange={(v: number | null) => onChange('time_intro_score', v)} disabled={isSent} />
              <SubScore label="Build Time" value={student.time_build_score} onChange={(v: number | null) => onChange('time_build_score', v)} disabled={isSent} />
              <SubScore label="Playtime & Activity" value={student.time_play_score} onChange={(v: number | null) => onChange('time_play_score', v)} disabled={isSent} />
            </div>
          </div>

          {/* 3. Build, Coding & Overall */}
          <div className="bg-white rounded-lg p-4 border border-gray-100">
            <p className="text-sm font-bold text-gray-900 mb-3">3. Build, Coding & Overall Score</p>
            <div className="grid grid-cols-2 gap-3">
              <SubScore label="Troubleshooting & Debugging" value={student.troubleshooting_score} onChange={(v: number | null) => onChange('troubleshooting_score', v)} disabled={isSent} />
              <SubScore label="Design & Creativity" value={student.design_score} onChange={(v: number | null) => onChange('design_score', v)} disabled={isSent} />
            </div>
          </div>

          {/* Text fields */}
          <div className="bg-white rounded-lg p-4 border border-gray-100 space-y-3">
            <TextField label="Let's Learn More About" value={student.learn_more_about} onChange={(v: string) => onChange('learn_more_about', v)} disabled={isSent} placeholder="What to focus on next time..." />
            <TextField label="What Did I Learn Today?" value={student.what_learned_today} onChange={(v: string) => onChange('what_learned_today', v)} disabled={isSent} placeholder="Key takeaway from the session..." />
            <TextField label="Instructor Remarks" value={student.instructor_remarks} onChange={(v: string) => onChange('instructor_remarks', v)} disabled={isSent} placeholder="Personal note for the parent..." />
          </div>

          {/* Per-student submit */}
          {isSent ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-green-800 text-sm font-medium">
                Feedback sent to {student.parent_email} on {sentDate}
              </p>
            </div>
          ) : (
            <button
              onClick={onSubmit}
              disabled={sending}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition shadow"
            >
              {sending ? 'Sending...' : 'Submit & Send Feedback to Parent'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ===== UI HELPER COMPONENTS =====
function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  disabled: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 text-gray-900"
      />
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  disabled: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 resize-none text-gray-900"
      />
    </div>
  )
}

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number | null
  onChange: (value: number) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !disabled && onChange(star)}
          disabled={disabled}
          className={`text-3xl transition ${
            (value || 0) >= star ? 'text-yellow-400' : 'text-gray-300'
          } ${disabled ? 'cursor-default' : 'hover:scale-110 cursor-pointer'}`}
        >
          ★
        </button>
      ))}
      <span className="ml-3 text-sm font-medium text-gray-600">
        {value ? `${value}/5` : 'Not rated'}
      </span>
    </div>
  )
}

function SubScore({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  disabled: boolean
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-1">{label}</p>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 text-gray-900 bg-white"
      >
        <option value="">— Select —</option>
        <option value="1">1 — Challenging</option>
        <option value="2">2</option>
        <option value="3">3 — Good Work</option>
        <option value="4">4</option>
        <option value="5">5 — Ur a Star!</option>
      </select>
    </div>
  )
}