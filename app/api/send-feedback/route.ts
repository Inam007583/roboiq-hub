import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerSupabase } from '@/lib/supabase-server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const supabase = await createServerSupabase()

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

  const { data: student, error: fetchError } = await supabase
    .from('students')
    .select(`*, sessions ( title, date, instructor_id, org_id, venues ( name ) )`)
    .eq('id', studentId)
    .single()

  if (fetchError || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const isOwner = student.sessions?.instructor_id === user.id
  const isAdmin = profile?.role === 'admin'
  let isCoInstructor = false
  if (!isOwner && !isAdmin) {
    const { data: co } = await supabase
      .from('session_instructors')
      .select('id')
      .eq('session_id', student.session_id)
      .eq('instructor_id', user.id)
      .maybeSingle()
    isCoInstructor = !!co
  }
  if (!isOwner && !isAdmin && !isCoInstructor) {
    return NextResponse.json({ error: 'Not authorized for this session' }, { status: 403 })
  }

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

  // Brand (organization) config for this session — governs sender, logo, colours, footer
  const orgId = (student.sessions as { org_id?: string } | null)?.org_id
  const { data: org } = orgId
    ? await supabase.from('organizations').select('*').eq('id', orgId).single()
    : { data: null }

  const brandName = org?.name || 'Creative IQ'
  const brandFrom = org?.email_from || process.env.FEEDBACK_FROM_EMAIL
  const brandReplyTo = org?.email_reply_to || process.env.REPLY_TO_EMAIL
  const brandAccent = org?.accent_color || '#4d8f0f'
  const brandContactEmail = org?.contact_email || 'info@creative-iq.co.uk'
  const brandContactPhone = org?.contact_phone || '07361 594569'
  const brandLogoPath = org?.logo_path || '/creative-iq-logo.png'

  if (!brandFrom) {
    return NextResponse.json(
      { error: `${brandName}'s email isn't set up yet — verify its domain in Resend first.` },
      { status: 422 }
    )
  }

  const childName = student.full_name || 'your child'
  const sessionTitle = student.sessions?.title || "today's session"
  const instructorName = profile?.full_name || ''
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const brandLogo = `${appUrl}${brandLogoPath}`
  const rateUrl = `${appUrl}/rate?n=${encodeURIComponent(childName)}&se=${encodeURIComponent(sessionTitle)}`

  // Render the feedback inline in the email body
  const esc = (s: unknown) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const row = (label: string, value: unknown) =>
    value == null || value === ''
      ? ''
      : `<tr>
          <td style="padding:7px 14px 7px 0;font-size:13px;color:#6b7280;vertical-align:top;white-space:nowrap;">${esc(label)}</td>
          <td style="padding:7px 0;font-size:14px;color:#111827;line-height:1.5;">${esc(value)}</td>
        </tr>`

  const section = (heading: string, rows: string) =>
    !rows
      ? ''
      : `<p style="margin:22px 0 4px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${brandAccent};">${esc(heading)}</p>
         <table style="width:100%;border-collapse:collapse;">${rows}</table>`

  const lessonRows = [
    row('Level', student.level),
    row('Date', student.sessions?.date),
    row('Day', student.day_number),
    student.is_repeat ? row('Repeat session', 'Yes') : '',
    row('Lesson Focus', student.lesson_focus),
  ].join('')

  const scoreRows = [
    row('Understanding of Instructions', student.understanding_score != null ? `${student.understanding_score} / 5` : ''),
    row('Troubleshooting & Debugging', student.troubleshooting_score),
    row('Design & Creativity', student.design_score),
  ].join('')

  const timeRows = [
    row('Intro & Pre-built', student.time_intro_score),
    row('Build Time', student.time_build_score),
    row('Playtime & Activity', student.time_play_score),
  ].join('')

  const notesRows = [
    row('What Did I Learn Today?', student.what_learned_today),
    row('Instructor Remarks', student.instructor_remarks),
    row("Let's Learn More About", student.learn_more_about),
    row('Safeguarding', student.safeguarding),
  ].join('')

  const feedbackHtml = [
    section('Lesson', lessonRows),
    section('Scores', scoreRows),
    section('Time management', timeRows),
    section('Notes', notesRows),
  ].join('')

  const button = (href: string, label: string, bg: string) =>
    `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px;margin:6px 8px 6px 0;">${label}</a>`

  const links = [
    student.drive_link ? button(student.drive_link, 'View session photos', '#4f46e5') : '',
    button(rateUrl, 'Rate your experience', '#f59e0b'),
  ].join('')

  const html = `
  <div style="background:#ffffff;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #eeeeee;border-radius:16px;overflow:hidden;">
      <div style="background:#ffffff;padding:26px 28px 18px;text-align:center;border-bottom:3px solid ${brandAccent};">
        <img src="${brandLogo}" alt="${esc(brandName)}" width="150" style="width:150px;max-width:62%;height:auto;" />
        <p style="margin:12px 0 0;color:#6b7280;font-size:12px;font-weight:700;letter-spacing:.08em;">SESSION FEEDBACK</p>
      </div>

      <div style="padding:28px;">
        <p style="margin:0 0 14px;font-size:15px;color:#111827;line-height:1.6;">
          Hi,<br><br>
          Thank you for attending our session today! Here is <strong>${esc(childName)}</strong>'s
          feedback from <strong>${esc(sessionTitle)}</strong>.
        </p>

        ${feedbackHtml}

        ${links ? `<div style="margin:22px 0 4px;">${links}</div>` : ''}
        ${instructorName ? `<p style="margin:20px 0 0;font-size:14px;color:#374151;">Warm regards,<br><strong>${instructorName}</strong></p>` : ''}
      </div>

      <div style="background:#f9fafb;padding:18px 28px;border-top:1px solid #eee;">
        <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
          For any queries, email us at
          <a href="mailto:${brandContactEmail}" style="color:${brandAccent};">${esc(brandContactEmail)}</a>
          or call <strong>${esc(brandContactPhone)}</strong>.
        </p>
      </div>
    </div>
  </div>`

  // TEST: while TEST_REDIRECT_EMAIL is set, deliver to that inbox instead of the
  // real parent (Resend test mode only delivers to your own address).
  const redirectTo = process.env.TEST_REDIRECT_EMAIL
  const to = redirectTo || parentEmail
  const testBanner = redirectTo
    ? `<div style="background:#fef3c7;color:#92400e;padding:10px 16px;font-size:13px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">TEST MODE — this would normally be sent to <strong>${parentEmail}</strong></div>`
    : ''

  const resend = new Resend(apiKey)
  const { error: sendError } = await resend.emails.send({
    from: `${brandName} <${brandFrom}>`,
    to,
    ...(brandReplyTo ? { replyTo: brandReplyTo } : {}),
    subject: `${childName}'s feedback — ${sessionTitle}`,
    html: testBanner + html,
  })

  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 502 })
  }

  const sentAt = new Date().toISOString()
  await supabase
    .from('students')
    .update({ feedback_sent_at: sentAt })
    .eq('id', studentId)

  return NextResponse.json({ ok: true, sentAt })
}
