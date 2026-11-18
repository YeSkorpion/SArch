import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Brand } from '../../components/Brand'
import { Button, Field, Input } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { cn } from '../../lib/cn'
import type { User } from '../../lib/types'

export function LoginPage() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => api<User>('/api/v1/auth/login', { method: 'POST', body: { email, password } }),
    onSuccess: async (user) => {
      client.setQueryData(['me'], user)
      await navigate('/projekte')
    },
  })

  return (
    <AuthCard title="Anmelden" subtitle="Melde dich an und arbeite an deinen Projekten weiter.">
      <form className="grid gap-4" onSubmit={(event) => submit(event, () => login.mutate())}>
        <Field label="E-Mail">
          <Input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Passwort">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        {login.isError ? <p role="alert" className="text-sm text-danger">{errorText(login.error)}</p> : null}
        <Button className="w-full" type="submit" variant="primary" disabled={login.isPending}>Anmelden</Button>
      </form>
      <p className="border-t border-line pt-4 text-center text-sm text-muted">
        Noch kein Konto? <Link className="font-medium text-foreground underline-offset-2 hover:underline" to="/registrieren">Registrieren</Link>
      </p>
    </AuthCard>
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const strength = passwordStrength(password)
  const mismatch = confirmation.length > 0 && confirmation !== password
  const ready = strength.met === strength.rules.length && password === confirmation
  const register = useMutation({
    mutationFn: async () => {
      await api('/api/v1/auth/register', { method: 'POST', body: { displayName, email, password } })
      return api<User>('/api/v1/auth/login', { method: 'POST', body: { email, password } })
    },
    onSuccess: async (user) => {
      client.setQueryData(['me'], user)
      await navigate('/projekte')
    },
  })

  return (
    <AuthCard title="Konto anlegen" subtitle="Das Passwort wird zweimal eingegeben. Die Anzeige zeigt, wie sicher es ist.">
      <form className="grid gap-4" onSubmit={(event) => submit(event, () => { if (ready) register.mutate() })}>
        <Field label="Name">
          <Input autoComplete="name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </Field>
        <Field label="E-Mail">
          <Input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Passwort">
          <Input type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        <PasswordStrength strength={strength} password={password} />
        <Field label="Passwort wiederholen">
          <Input type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </Field>
        {mismatch ? <p role="alert" className="text-sm text-danger">Die Passwörter stimmen nicht überein.</p> : null}
        {register.isError ? <p role="alert" className="text-sm text-danger">{errorText(register.error)}</p> : null}
        <Button className="w-full" type="submit" variant="primary" disabled={register.isPending || !ready}>Registrieren</Button>
      </form>
      <p className="border-t border-line pt-4 text-center text-sm text-muted">
        Bereits ein Konto? <Link className="font-medium text-foreground underline-offset-2 hover:underline" to="/anmelden">Anmelden</Link>
      </p>
    </AuthCard>
  )
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-8">
      <section className="my-auto w-full max-w-md overflow-hidden rounded-2xl border border-line bg-card shadow-overlay">
        <div className="h-1 bg-accent" aria-hidden />
        <div className="grid gap-5 p-6 sm:p-8">
          <div className="grid justify-items-center gap-3 text-center">
            <Brand />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-balance text-muted">{subtitle}</p> : null}
            </div>
          </div>
          {children}
        </div>
      </section>
    </main>
  )
}

function PasswordStrength({ strength, password }: { strength: Strength; password: string }) {
  const tone = strength.level === 'schwach' ? 'bg-danger' : strength.level === 'mittel' ? 'bg-warning' : 'bg-ok'
  const text = strength.level === 'schwach' ? 'text-danger' : strength.level === 'mittel' ? 'text-warning' : 'text-ok'
  return (
    <div className="-mt-2 grid gap-2">
      <div className="flex items-center gap-3">
        <div
          className="grid flex-1 grid-cols-5 gap-1"
          role="meter"
          aria-label="Passwortstärke"
          aria-valuemin={0}
          aria-valuemax={strength.rules.length}
          aria-valuenow={strength.met}
          aria-valuetext={password ? strength.label : 'Noch leer'}
        >
          {strength.rules.map((rule, index) => (
            <span key={rule.label} className={cn('h-1.5 rounded-full', index < strength.met ? tone : 'bg-line')} />
          ))}
        </div>
        <span className={cn('w-20 text-right text-xs font-medium', password ? text : 'text-muted')}>{password ? strength.label : 'Noch leer'}</span>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Passwortregeln">
        {strength.rules.map((rule) => (
          <li key={rule.label} className={rule.met ? 'text-ok' : 'text-muted'} aria-label={`${rule.label}, ${rule.met ? 'erfüllt' : 'offen'}`}>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

type Strength = ReturnType<typeof passwordStrength>

function passwordStrength(password: string) {
  const rules = [
    { label: '12 Zeichen', met: password.length >= 12 },
    { label: 'Kleinbuchstabe', met: /[a-z]/.test(password) },
    { label: 'Großbuchstabe', met: /[A-Z]/.test(password) },
    { label: 'Ziffer', met: /\d/.test(password) },
    { label: 'Sonderzeichen', met: /[^A-Za-z0-9]/.test(password) },
  ]
  const met = rules.filter((rule) => rule.met).length
  const level = met <= 2 ? 'schwach' : met <= 4 ? 'mittel' : password.length >= 16 ? 'sehr stark' : 'stark'
  const label = level === 'schwach' ? 'Schwach' : level === 'mittel' ? 'Mittel' : level === 'sehr stark' ? 'Sehr stark' : 'Stark'
  return { rules, met, level, label }
}

function submit(event: FormEvent, action: () => void) {
  event.preventDefault()
  action()
}
