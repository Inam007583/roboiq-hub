import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerSupabase } from '@/lib/supabase-server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function scoreLine(label: string, value: number | null) {
  if (value == null) return ''
  return `<tr>
    <td style="padding:6px 12px;color:#555;">${label}</td>
    <td style="padding:6px 12px;font-weight:600;">${value} / 5</td>
  </tr>`
}

function textRow(label: string, value: string | null) {
  if (!value || !value.trim()) return ''
  return `<div style="margin:10px 0;">
    <p style="margin:0;font-size:13px;color:#6b7280;font-weight:600;">${label}</p>
    <p style="margin:2px 0 0;font-size:15px;color:#111827;">${value}</p>
  </div>`
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()

  // 1. Must be a logged-in instructor
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let studentId: string
  try {
    const body = await request.json()
    studentId = body.studentId
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!studentId) {
    return NextResponse.json({ error: 'Missing studentId' }, { status: 400 })
  }

  // 2. Load the student + its session/venue
  const { data: student, error: fetchError } = await supabase
    .from('students')
    .select(`*, sessions ( title, date, instructor_id, venues ( name ) )`)
    .eq('id', studentId)
    .single()

  if (fetchError || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // 3. Only the assigned instructor (or an admin) may send
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isOwner = student.sessions?.instructor_id === user.id
  const isAdmin = profile?.role === 'admin'
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Not authorized for this session' }, { status: 403 })
  }

  // 4. Validate the parent email (wrong address = privacy issue)
  const parentEmail = (student.parent_email || '').trim()
  if (!EMAIL_RE.test(parentEmail)) {
    return NextResponse.json(
      { error: 'This student has no valid parent email. Add one before sending.' },
      { status: 422 }
    )
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Email is not configured yet (missing RESEND_API_KEY).' },
      { status: 500 }
    )
  }

  // 5. Format the feedback sheet
  const venueName = student.sessions?.venues?.name || ''
  const sessionTitle = student.sessions?.title || 'Session'
  const sessionDate = student.sessions?.date || ''

  const scores = [
    scoreLine('Understanding of Instructions', student.understanding_score),
    scoreLine('Time — Intro &amp; Pre-built', student.time_intro_score),
    scoreLine('Time — Build', student.time_build_score),
    scoreLine('Time — Playtime &amp; Activity', student.time_play_score),
    scoreLine('Troubleshooting &amp; Debugging', student.troubleshooting_score),
    scoreLine('Design &amp; Creativity', student.design_score),
  ].join('')

  const texts = [
    textRow("Let's Learn More About", student.learn_more_about),
    textRow('What Did I Learn Today?', student.what_learned_today),
    textRow('Instructor Remarks', student.instructor_remarks),
  ].join('')

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
    <div style="background:#4f46e5;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:20px;">Creative IQ Hub</h1>
      <p style="margin:4px 0 0;opacity:.9;font-size:14px;">Session Feedback</p>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      <h2 style="margin:0 0 4px;font-size:18px;">${student.full_name || 'Student'}</h2>
      <p style="margin:0;color:#6b7280;font-size:14px;">
        ${sessionTitle}${venueName ? ' · ' + venueName : ''}${sessionDate ? ' · ' + sessionDate : ''}
      </p>
      ${student.lesson_focus ? `<p style="margin:8px 0 0;font-size:14px;">Lesson focus: <strong>${student.lesson_focus}</strong></p>` : ''}

      ${scores ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">${scores}</table>` : ''}
      ${texts}

      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">
        Sent via Creative IQ Hub. Please reply to this email if anything looks incorrect.
      </p>
    </div>
  </div>`

  // 6. Send
  const resend = new Resend(apiKey)
  const from = process.env.FEEDBACK_FROM_EMAIL || 'onboarding@resend.dev'
  const { error: sendError } = await resend.emails.send({
    from: `Creative IQ Hub <${from}>`,
    to: parentEmail,
    subject: `Feedback for ${student.full_name || 'your child'} — ${sessionTitle}`,
    html,
  })

  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 502 })
  }

  // 7. Stamp as sent
  const sentAt = new Date().toISOString()
  await supabase
    .from('students')
    .update({ feedback_sent_at: sentAt })
    .eq('id', studentId)

  return NextResponse.json({ ok: true, sentAt })
}
