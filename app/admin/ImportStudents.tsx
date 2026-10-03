'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase'
import type { Session } from '@/lib/types'

type Row = Record<string, string>
type FieldKey = 'name' | 'email' | 'level' | 'day'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isValidEmail = (v: string) => EMAIL_RE.test((v || '').trim())

export default function ImportStudents({
  sessions,
  onImported,
}: {
  sessions: Session[]
  onImported: () => void
}) {
  const supabase = createClient()
  const [sessionId, setSessionId] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [map, setMap] = useState<Record<FieldKey, string>>({ name: '', email: '', level: '', day: '' })
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult('')

    // Reads .xlsx, .xls and .csv
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false })

    // Some Pebble exports put a title/banner row (and date) above the real header
    // row. Find the row that actually contains column names like child / email.
    const KNOWN = ['child', 'email', 'dob', 'customer', 'ticket', 'mobile', 'medical', 'notes', 'photo', 'attendance', 'pupil', 'student']
    let hr = matrix.findIndex(row =>
      Array.isArray(row) && (row as unknown[]).some(c => KNOWN.includes(String(c).toLowerCase().trim()))
    )
    if (hr < 0) hr = 0

    const rawHdrs = ((matrix[hr] as unknown[]) || []).map(h => String(h).trim())
    const hdrs = rawHdrs.filter(Boolean)
    const data: Row[] = matrix
      .slice(hr + 1)
      .map(r => {
        const cells = r as unknown[]
        const o: Row = {}
        rawHdrs.forEach((h, i) => { if (h) o[h] = String(cells[i] ?? '').trim() })
        return o
      })
      .filter(o => Object.values(o).some(v => v))

    setRows(data)
    setHeaders(hdrs)

    // Prefer an exact header match before a partial one, so "email" wins over
    // "Partner's name and email".
    const find = (...keys: string[]) => {
      for (const k of keys) {
        const exact = hdrs.find(h => h.toLowerCase().trim() === k)
        if (exact) return exact
      }
      for (const k of keys) {
        const partial = hdrs.find(h => h.toLowerCase().includes(k))
        if (partial) return partial
      }
      return ''
    }
    setMap({
      name: find('child', 'pupil', 'student', 'name'),
      email: find('email', 'e-mail', 'parent email', 'guardian email'),
      level: find('level', 'year', 'group', 'class'),
      day: find('day'),
    })
  }

  async function doImport() {
    if (!sessionId) { alert('Choose the session to import these students into.'); return }
    if (!map.name || !map.email) { alert('Map at least Student name and Parent email.'); return }

    const payload = rows
      .map(r => {
        const email = (r[map.email] || '').trim()
        return {
          session_id: sessionId,
          full_name: (r[map.name] || '').trim() || null,
          // Only store a valid email — a bad/"N/A" one would silently fail at send time
          parent_email: isValidEmail(email) ? email : null,
          level: map.level ? (r[map.level] || '').trim() || null : null,
          day_number: map.day ? (r[map.day] || '').trim() || null : null,
        }
      })
      .filter(s => s.full_name)

    if (payload.length === 0) { alert('No rows with a student name were found.'); return }

    const missing = payload.filter(s => !s.parent_email).length

    setImporting(true)
    const { data, error } = await supabase.from('students').insert(payload).select('id')
    setImporting(false)

    if (error) { setResult(`Error: ${error.message}`); return }
    setResult(
      `Imported ${data?.length ?? 0} students.` +
      (missing > 0 ? ` ⚠ ${missing} have no valid parent email — add it before sending feedback.` : '')
    )
    setRows([]); setHeaders([]); setMap({ name: '', email: '', level: '', day: '' })
    onImported()
  }

  const field = (key: FieldKey, label: string) => (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      <select
        value={map[key]}
        onChange={e => setMap({ ...map, [key]: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
      >
        <option value="">— None —</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  )

  return (
    <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Import students (from Pebble)</h2>
      <p className="text-sm text-gray-500 mb-4">
        Export a class list from Pebble as Excel (.xlsx), pick the matching session, then upload.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Import into session</label>
          <select
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
          >
            <option value="">— Select session —</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.title} · {s.date} · {s.venues?.name || '—'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Excel file (.xlsx)</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-sm file:font-medium hover:file:bg-indigo-700"
          />
        </div>
      </div>

      {headers.length > 0 && (
        <>
          <p className="text-sm font-semibold text-gray-700 mb-2">Match columns ({rows.length} rows found)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {field('name', 'Student name *')}
            {field('email', 'Parent email *')}
            {field('level', 'Level / class')}
            {field('day', 'Day')}
          </div>

          {map.name && map.email && (() => {
            const validCount = rows.filter(r => isValidEmail(r[map.email])).length
            const missingCount = rows.length - validCount
            return (
              <>
                <div className="flex items-center gap-4 mb-2 text-sm">
                  <span className="text-green-700 font-medium">✓ {validCount} with a valid parent email</span>
                  {missingCount > 0 && <span className="text-amber-700 font-medium">⚠ {missingCount} need checking</span>}
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  Review the parent email for each student below before importing. Rows marked ⚠ will be imported without an email, so you can add it later.
                </p>
                <div className="overflow-y-auto max-h-72 border border-gray-100 rounded-lg mb-4">
                  <table className="text-sm border-collapse w-full">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="text-left text-gray-500">
                        <th className="px-3 py-2">Student</th>
                        <th className="px-3 py-2">Parent email</th>
                        <th className="px-3 py-2 text-right">OK?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const email = (r[map.email] || '').trim()
                        const ok = isValidEmail(email)
                        return (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-1.5 text-gray-900">{r[map.name]}</td>
                            <td className={`px-3 py-1.5 ${ok ? 'text-gray-900' : 'text-amber-700'}`}>{email || '(none)'}</td>
                            <td className="px-3 py-1.5 text-right">{ok ? '✓' : '⚠'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          <button
            onClick={doImport}
            disabled={importing}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {importing ? 'Importing...' : `Import ${rows.length} students`}
          </button>
        </>
      )}

      {result && <p className="text-sm mt-3 font-medium text-gray-700">{result}</p>}
    </section>
  )
}
