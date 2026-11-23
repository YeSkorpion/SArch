import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, ChevronDown } from 'lucide-react'
import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'

const presenceMs = 180

export function usePresence(open: boolean) {
  const [present, setPresent] = useState(open)
  useEffect(() => {
    if (open) {
      setPresent(true)
      return
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setPresent(false), reduce ? 0 : presenceMs)
    return () => window.clearTimeout(timer)
  }, [open])
  return { present, state: open ? 'open' as const : 'closed' as const }
}

export function StudioProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delayDuration={400}>{children}</Tooltip.Provider>
}

export function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="studio-menu z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-overlay" sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'ok'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-background text-muted',
    accent: 'bg-accent/12 text-accent',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/12 text-danger',
    ok: 'bg-ok/12 text-ok',
  }
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  )
}

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-foreground shadow-sm hover:brightness-110',
        secondary: 'border border-line bg-card hover:bg-background hover:border-accent/40',
        ghost: 'hover:bg-background',
        danger: 'bg-danger-solid text-white shadow-sm hover:brightness-110',
      },
      size: {
        sm: 'h-8 px-2',
        md: 'h-10',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonStyles({ variant, size }), className)} {...props} />
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-muted">{hint}</span> : null}
    </label>
  )
}

const control = 'h-10 w-full rounded-md border border-line bg-card px-3 text-sm'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('min-h-28 w-full rounded-md border border-line bg-card px-3 py-2 text-sm', props.className)} />
}

export function Select({ className, children, value, disabled, onChange, onKeyDown, onMouseDown, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const selectRef = useRef<HTMLSelectElement>(null)
  const [options, setOptions] = useState<SelectOption[]>(() => collectOptions(children))
  useLayoutEffect(() => {
    const select = selectRef.current
    if (!select) return
    const next = [...select.options].map((option) => ({
      value: option.value,
      label: option.text.replace(/\s+/g, ' ').trim(),
      disabled: option.disabled,
    }))
    setOptions((currentOptions) => optionsEqual(currentOptions, next) ? currentOptions : next)
  })
  const current = value == null ? '' : String(value)
  const selected = options.find((option) => option.value === current)
  const inline = className?.split(/\s+/).includes('studio-inline') ?? false
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const typed = useRef('')
  const typedAt = useRef(0)
  const [open, setOpen] = useState(false)
  const menuPresence = usePresence(open)
  const [cursor, setCursor] = useState(0)
  const [portal, setPortal] = useState<HTMLElement | null>(null)
  const [place, setPlace] = useState<MenuPlace | null>(null)

  function choose(next: string) {
    setOpen(false)
    onChange?.({ target: { value: next }, currentTarget: { value: next } } as ChangeEvent<HTMLSelectElement>)
    selectRef.current?.focus()
  }

  function openMenu(index = options.findIndex((option) => option.value === current)) {
    if (disabled || options.length === 0) return
    setCursor(index >= 0 ? index : 0)
    setOpen(true)
  }

  function move(step: number) {
    if (options.length === 0) return
    setCursor((currentIndex) => {
      let next = currentIndex
      for (let attempt = 0; attempt < options.length; attempt += 1) {
        next = (next + step + options.length) % options.length
        if (!options[next]?.disabled) return next
      }
      return currentIndex
    })
  }

  function matchTyped(key: string) {
    const now = Date.now()
    const buffer = now - typedAt.current < 700 ? `${typed.current}${key}` : key
    typed.current = buffer
    typedAt.current = now
    const needle = buffer.toLowerCase()
    const start = buffer.length === 1 ? cursor + 1 : 0
    const found = options.findIndex((option, index) => index >= start && option.label.toLowerCase().startsWith(needle))
    const fallback = options.findIndex((option) => option.label.toLowerCase().startsWith(needle))
    const index = found >= 0 ? found : fallback
    if (index < 0) return
    if (!open) choose(options[index].value)
    else setCursor(index)
  }

  function onSelectKey(event: KeyboardEvent<HTMLSelectElement>) {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled) return
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    const printable = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey
    if (printable) {
      event.preventDefault()
      matchTyped(event.key)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'F4'].includes(event.key)) return
    event.preventDefault()
    if (!open) {
      openMenu(event.key === 'ArrowUp' ? options.length - 1 : Math.max(0, options.findIndex((option) => option.value === current)))
      return
    }
    if (event.key === 'ArrowDown') move(1)
    else if (event.key === 'ArrowUp') move(-1)
    else if (event.key === 'Home') setCursor(0)
    else if (event.key === 'End') setCursor(options.length - 1)
    else if ((event.key === 'Enter' || event.key === ' ') && options[cursor] && !options[cursor].disabled) choose(options[cursor].value)
  }

  useLayoutEffect(() => {
    if (!open) return
    const root = rootRef.current
    if (!root) return
    function layout() {
      const currentRoot = rootRef.current
      if (!currentRoot) return
      const rect = currentRoot.getBoundingClientRect()
      const host = currentRoot.closest('[role="dialog"], [role="alertdialog"]')
      const origin = host instanceof HTMLElement ? host.getBoundingClientRect() : null
      const below = window.innerHeight - rect.bottom
      const above = rect.top
      const upward = below < 200 && above > below
      const maxHeight = Math.max(120, Math.min(288, (upward ? above : below) - 16))
      setPortal(host instanceof HTMLElement ? host : document.body)
      setPlace({
        upward,
        top: rect.bottom - (origin?.top ?? 0) + 6,
        bottom: (origin?.bottom ?? window.innerHeight) - rect.top + 6,
        left: Math.max(8, rect.left - (origin?.left ?? 0)),
        minWidth: rect.width,
        maxHeight,
        fixed: origin == null,
      })
    }
    layout()
    function onScroll(event: Event) {
      const menu = menuRef.current
      if (menu && (event.target === menu || menu.contains(event.target as Node))) return
      layout()
    }
    window.addEventListener('resize', layout)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', layout)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, cursor])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!open || !menu || !place) return
    const rect = menu.getBoundingClientRect()
    const overflow = rect.right - (window.innerWidth - 8)
    if (overflow > 1) setPlace((current) => current ? { ...current, left: Math.max(8, current.left - overflow) } : current)
  }, [open, place])

  useLayoutEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  return (
    <div ref={rootRef} className={cn('studio-select relative', inline ? 'inline-block max-w-full' : 'w-full')}>
      <select
        {...props}
        ref={selectRef}
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        value={value}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${cursor}` : undefined}
        onChange={onChange}
        onPointerDown={(event) => event.preventDefault()}
        onMouseDown={(event) => {
          event.preventDefault()
          onMouseDown?.(event)
        }}
        onClick={(event) => event.preventDefault()}
        onKeyDown={onSelectKey}
      >
        {children}
      </select>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        className={cn(control, 'flex items-center justify-between gap-2 pr-2 text-left hover:border-accent/40 hover:bg-background', open && 'border-accent', inline && 'h-9 w-auto', className)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) setOpen(false)
          else openMenu()
        }}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ''}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {menuPresence.present && place && portal ? createPortal(
        <div
          ref={menuRef}
          id={listId}
          role="listbox"
          data-state={menuPresence.state}
          className="studio-menu z-[80] overflow-auto rounded-lg border border-line bg-card p-1 text-foreground shadow-overlay"
          style={{
            position: place.fixed ? 'fixed' : 'absolute',
            top: place.upward ? undefined : place.top,
            bottom: place.upward ? place.bottom : undefined,
            left: place.left,
            minWidth: place.minWidth,
            maxWidth: 360,
            maxHeight: place.maxHeight,
          }}
        >
          {options.map((option, index) => {
            const active = index === cursor
            const picked = option.value === current
            return (
              <button
                id={`${listId}-${index}`}
                key={`${option.value}-${index}`}
                type="button"
                role="option"
                aria-selected={picked}
                data-active={active}
                disabled={option.disabled}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm',
                  picked ? 'bg-accent font-medium text-accent-fg' : active ? 'bg-accent/12 text-foreground' : 'hover:bg-accent/12',
                )}
                onMouseEnter={() => setCursor(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.value)}
              >
                <span className="truncate">{option.label}</span>
                {picked ? <Check className="size-3.5 shrink-0" /> : null}
              </button>
            )
          })}
        </div>,
        portal,
      ) : null}
    </div>
  )
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="studio-overlay fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="studio-dialog fixed left-1/2 top-1/2 z-50 grid w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-line bg-card p-5 shadow-overlay">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          {description ? <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description> : null}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
  pending?: boolean
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="studio-overlay fixed inset-0 z-40 bg-black/40" />
        <AlertDialog.Content className="studio-dialog fixed left-1/2 top-1/2 z-50 grid w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-line bg-card p-5 shadow-overlay">
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm">{description}</AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button type="button">Abbrechen</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button type="button" variant="danger" onClick={onConfirm} disabled={pending}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

export function Menu({ trigger, children, className }: { trigger: ReactNode; children: ReactNode; className?: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={cn('studio-menu z-50 min-w-48 overflow-hidden rounded-lg border border-line bg-card p-1 shadow-overlay', className)} sideOffset={6}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function MenuItem({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <DropdownMenu.Item className="cursor-pointer rounded-md px-2 py-1 text-sm outline-none data-[highlighted]:bg-accent/15 data-[highlighted]:text-accent" onSelect={onSelect}>
      {children}
    </DropdownMenu.Item>
  )
}

type MenuPlace = {
  upward: boolean
  top: number
  bottom: number
  left: number
  minWidth: number
  maxHeight: number
  fixed: boolean
}

type SelectOption = { value: string; label: string; disabled: boolean }

function optionsEqual(left: SelectOption[], right: SelectOption[]) {
  return left.length === right.length && left.every((option, index) => option.value === right[index]?.value && option.label === right[index]?.label && option.disabled === right[index]?.disabled)
}

function collectOptions(children: ReactNode): SelectOption[] {
  const options: { value: string; label: string; disabled: boolean }[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>(child) || child.type !== 'option') return
    const label = optionText(child.props.children).replace(/\s+/g, ' ').trim()
    options.push({
      value: child.props.value == null ? label : String(child.props.value),
      label,
      disabled: Boolean(child.props.disabled),
    })
  })
  return options
}

function optionText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(optionText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return optionText(node.props.children)
  return ''
}
