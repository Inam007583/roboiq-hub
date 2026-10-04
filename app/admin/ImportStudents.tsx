'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase'
import type { VenueRow } from '@/lib/types'

type Row = Record<string, string>
type FieldKey = 'name' | 'email' | 'level'
interface RosterStudent { id: string; full_name: string | null; parent_email: string | null; level: string | null }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isValidEmail = (v: string) => EMAIL_RE.test((v || '').trim())

export default function ImportStudents({
  venues,
  onChanged,
}: {
  venues: VenueRow[]
  onChanged: () => void
}) {
  const supabase = createClient()
  const [venueId, setVenueId] = useState('')
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [map, setMap] = useState<Record<FieldKey, string>>({ name: '', email: '', level: '' })
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState('')

  // Manual add-one form
  const [mName, setMName] = useState('')
  const [mEmail, setMEmail] = useState('')
  const [mLevel, setMLevel] = useState('')
  const [addingOne, setAddingOne] = useState(false)

  async function loadRoster(vid: string) {
    if (!vid) { setRoster([]); return }
    const { data } = await supabase
      .from('rosters')
      .select('id, full_name, parent_email, level')
      .eq('venue_id', vid)
      .order('full_name')
    setRoster(data || [])
  }

  function onVenue(vid: string) {
    setVenueId(vid)
    setResult('')
    loadRoster(vid)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult('')

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false })

    // Skip any title/banner rows above the real header row
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
    })
  }

  async function doImport() {
    if (!venueId) { alert('Choose a venue first.'); return }
    if (!map.name || !map.email) { alert('Map at least Student name and Parent email.'); return }

    const payload = rows
      .map(r => {
        const email = (r[map.email] || '').trim()
        return {
          venue_id: venueId,
          full_name: (r[map.name] || '').trim() || null,
          parent_email: isValidEmail(email) ? email : null,
          level: map.level ? (r[map.level] || '').trim() || null : null,
          active: true,
        }
      })
      .filter(s => s.full_name)

    if (payload.length === 0) { alert('No rows with a student name were found.'); return }
    if (!confirm(`This replaces the current roster for this venue with ${payload.length} students. Continue?`)) return

    const missing = payload.filter(s => !s.parent_email).length
    setImporting(true)
    await supabase.from('rosters').delete().eq('venue_id', venueId)
    const { data, error } = await supabase.from('rosters').insert(payload).select('id')
    setImporting(false)

    if (error) { setResult(`Error: ${error.message}`); return }
    setResult(
      `Roster set: ${data?.length ?? 0} students.` +
      (missing > 0 ? ` ⚠ ${missing} have no valid parent email — add it before sending feedback.` : '')
    )
    setRows([]); setHeaders([]); setMap({ name: '', email: '', level: '' })
    await loadRoster(venueId)
    onChanged()
  }

  async function removeStudent(id: string) {
    await supabase.from('rosters').delete().eq('id', id)
    await loadRoster(venueId)
    onChanged()
  }

  async function addOne() {
    if (!venueId) { alert('Choose a venue first.'); return }
    if (!mName.trim()) { alert('Enter the student\'s name.'); return }
    const email = mEmail.trim()
    if (email && !isValidEmail(email)) { alert('That parent email doesn\'t look valid.'); return }
    setAddingOne(true)
    const { error } = await supabase.from('rosters').insert({
      venue_id: venueId,
      full_name: mName.trim(),
      parent_email: email || null,
      level: mLevel.trim() || null,
      active: true,
    })
    setAddingOne(false)
    if (error) { alert(`Could not add student: ${error.message}`); return }
    setMName(''); setMEmail(''); setMLevel('')
    await loadRoster(venueId)
    onChanged()
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
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Class rosters</h2>
      <p className="text-sm text-gray-500 mb-4">
        Import each class once from Pebble (Excel). Every new session you add for that venue is auto-filled with these students — you only update when a child joins or leaves.
      </p>

      <div className="mb-4 max-w-sm">
        <label className="block text-xs font-semibold text-gray-700 mb-1">Venue</label>
        <select
          value={venueId}
          onChange={e => onVenue(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
        >
          <option value="">— Select venue —</option>
          {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      {venueId && (
        <>
          {/* Current roster */}
          <p className="text-sm font-semibold text-gray-700 mb-2">Current roster ({roster.length})</p>
          {roster.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">No students yet — upload a Pebble file below.</p>
          ) : (
            <div className="overflow-y-auto max-h-56 border border-gray-100 rounded-lg mb-4">
              <table className="text-sm w-full">
                <tbody>
                  {roster.map(r => (
                    <tr key={r.id} className="border-t border-gray-100 first:border-t-0">
                      <td className="px-3 py-1.5 text-gray-900">{r.full_name}</td>
                      <td className={`px-3 py-1.5 ${r.parent_email ? 'text-gray-600' : 'text-amber-700'}`}>{r.parent_email || '(no email)'}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => removeStudent(r.id)} className="text-xs text-red-700 hover:underline">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add one student manually (e.g. paid the company directly, not via Pebble) */}
          <p className="text-sm font-semibold text-gray-700 mb-2">Add a student manually</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center mb-5">
            <input value={mName} onChange={e => setMName(e.target.value)} placeholder="Student name" className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
            <input value={mEmail} onChange={e => setMEmail(e.target.value)} placeholder="Parent email" className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
            <input value={mLevel} onChange={e => setMLevel(e.target.value)} placeholder="Level (optional)" className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
            <button onClick={addOne} disabled={addingOne} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap">
              {addingOne ? 'Adding...' : 'Add'}
            </button>
          </div>

          {/* Upload to replace roster */}
          <label className="block text-xs font-semibold text-gray-700 mb-1">Upload Pebble file (.xlsx) to set / replace this roster</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-sm file:font-medium hover:file:bg-indigo-700 mb-4"
          />

          {headers.length > 0 && (
            <>
              <p className="text-sm font-semibold text-gray-700 mb-2">Match columns ({rows.length} rows)</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {field('name', 'Student name *')}
                {field('email', 'Parent email *')}
                {field('level', 'Level / class')}
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
                    <div className="overflow-y-auto max-h-56 border border-gray-100 rounded-lg mb-4">
                      <table className="text-sm w-full">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-left text-gray-500">
                            <th className="px-3 py-2">Student</th><th className="px-3 py-2">Parent email</th><th className="px-3 py-2 text-right">OK?</th>
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
                {importing ? 'Saving...' : `Set roster (${rows.length} students)`}
              </button>
            </>
          )}

          {result && <p className="text-sm mt-3 font-medium text-gray-700">{result}</p>}
        </>
      )}
    </section>
  )
}
