import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerSupabase } from '@/lib/supabase-server'

// Public endpoint — parents aren't logged in.
export async function POST(request: Request) {
  let body: { brand?: string; studentId?: string; rating?: number; comments?: string; recommend?: boolean; parentName?: string; childName?: string; sessionTitle?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const rating = Number(body.rating)
  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Please give a star rating.' }, { status: 422 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Email is not configured yet.' }, { status: 500 })
  }

  // Brand config (public read of organizations)
  const supabase = await createServerSupabase()
  const { data: org } = await supabase
    .from('organizations')
    .select('name, logo_path, accent_color, email_from, contact_email')
    .eq('slug', body.brand || 'creative-iq')
    .single()

  const brandName = org?.name || 'Creative IQ'
  const accent = org?.accent_color || '#4d8f0f'
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const logo = `${appUrl}${org?.logo_path || '/creative-iq-logo.png'}`
  const toEmail = org?.contact_email || process.env.RATINGS_TO_EMAIL || 'info@creative-iq.co.uk'
  const fromEmail = org?.email_from || process.env.FEEDBACK_FROM_EMAIL || 'onboarding@resend.dev'

  const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating)
  const context = [body.childName, body.sessionTitle].filter(Boolean).join(' · ')

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
    <div style="background:#ffffff;border:1px solid #eeeeee;border-bottom:3px solid ${accent};border-radius:12px 12px 0 0;padding:22px 24px;text-align:center;">
      <img src="${logo}" alt="${esc(brandName)}" style="height:48px;width:auto;" />
      <p style="margin:10px 0 0;color:#6b7280;font-size:12px;font-weight:700;letter-spacing:.08em;">NEW PARENT RATING</p>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      <p style="font-size:26px;margin:0;color:#f59e0b;letter-spacing:3px;">${stars}</p>
      <p style="margin:4px 0 16px;font-size:15px;"><strong>${rating} / 5</strong></p>
      ${context ? `<p style="margin:0 0 12px;color:#6b7280;font-size:14px;">${esc(context)}</p>` : ''}
      ${body.parentName ? `<p style="margin:0 0 8px;font-size:14px;">From: <strong>${esc(body.parentName)}</strong></p>` : ''}
      ${body.recommend != null ? `<p style="margin:0 0 8px;font-size:14px;">Would recommend: <strong>${body.recommend ? 'Yes' : 'No'}</strong></p>` : ''}
      ${body.comments && body.comments.trim() ? `<div style="margin:12px 0 0;"><p style="margin:0 0 2px;font-size:12px;font-weight:700;text-transform:uppercase;color:${accent};">Comments</p><p style="margin:0;font-size:15px;line-height:1.5;">${esc(body.comments)}</p></div>` : ''}
    </div>
  </div>`

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: `${brandName} Ratings <${fromEmail}>`,
    to: toEmail,
    subject: `New parent rating: ${rating}/5${body.childName ? ` — ${body.childName}` : ''}`,
    html,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
