import { expect, test, type Page } from '@playwright/test'

const password = 'Planung-Test-1'

test('durchgängige Planung auf dem Desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Die grafische Bearbeitung ist für den Desktop ausgelegt.')
  test.setTimeout(180_000)
  const email = `fluss-${Date.now()}@example.com`
  await register(page, email)
  await page.getByLabel('Name').focus()
  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)
  expect(outline).not.toBe('none')

  await page.getByLabel('Name').fill('Kundenfreigabe')
  await page.getByRole('button', { name: 'Projekt anlegen' }).click()
  await expect(page.getByRole('heading', { name: 'Kundenfreigabe' })).toBeVisible()
  const darkBefore = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.getByRole('button', { name: 'Darstellung' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('studio-theme'))).toBe(darkBefore ? 'light' : 'dark')

  await openSection(page, 'Anforderungen')
  await page.getByRole('button', { name: 'Anforderung anlegen' }).click()
  await page.getByRole('dialog').getByLabel('Titel').fill('Bestellung freigeben')
  await page.getByRole('dialog').getByRole('button', { name: 'Anlegen' }).click()
  await page.getByRole('link', { name: /REQ-001 Bestellung freigeben/ }).click()
  const requirementUrl = page.url()
  await change(page, '/requirements/', 'PATCH', async () => {
    await page.getByLabel('Beschreibung').fill('Eine Bestellung braucht eine Freigabe.')
  })

  await createScreen(page, 'Danke', '/danke')
  await change(page, '/screens/', 'PUT', async () => {
    await page.getByRole('button', { name: 'Text', exact: true }).click()
  })
  await change(page, '/screens/', 'PUT', async () => {
    await page.getByLabel('Text').fill('Danke für die Bestellung')
  })

  await createScreen(page, 'Freigabemaske', '/freigabe')
  await change(page, '/screens/', 'PUT', async () => {
    await page.getByRole('button', { name: 'Button', exact: true }).click()
  })
  await change(page, '/screens/', 'PUT', async () => {
    await page.getByLabel('Text').fill('Weiter')
    await page.getByLabel('Breite').fill('200')
    await page.getByLabel('Geplante Navigation').selectOption({ label: 'Danke' })
  })
  await change(page, '/screens/', 'PUT', async () => {
    await page.getByRole('button', { name: 'Mobil' }).click()
    await page.getByRole('button', { name: 'Text', exact: true }).click()
  })
  await change(page, '/screens/', 'PUT', async () => {
    await page.getByLabel('Text').fill('Mobilansicht')
  })
  await page.reload()
  await page.getByRole('button', { name: 'Mobil' }).click()
  await expect(page.getByText('Mobilansicht')).toBeVisible()
  await page.getByRole('button', { name: 'Desktop' }).click()
  await page.getByText('Weiter').click()
  await expect(page.getByLabel('Breite')).toHaveValue('200')
  await page.getByRole('button', { name: 'Vorschau' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await expect(page.getByText('Danke für die Bestellung')).toBeVisible()
  await page.getByRole('button', { name: 'Zurück zum Entwurf' }).click()
  await expect(page.getByLabel('Geplante Navigation')).toHaveValue(/.+/)

  await openSection(page, 'Systemarchitektur')
  await page.getByRole('link', { name: 'Komponenten' }).click()
  await createComponent(page, 'Bestellservice', 'Service')
  await createComponent(page, 'Kundenportal', 'Client')
  await openSection(page, 'Systemarchitektur')
  await createDiagram(page, 'Kontext')
  await change(page, '/diagrams/', 'PUT', async () => {
    await page.getByRole('button', { name: 'Kundenportal', exact: true }).click()
  })
  await change(page, '/diagrams/', 'PUT', async () => {
    await page.getByRole('button', { name: 'Bestellservice', exact: true }).click()
  })
  await page.getByRole('button', { name: 'Komponente: Kundenportal' }).click()
  const placementEdge = page.waitForResponse((response) => response.url().includes('/diagrams/') && response.request().method() === 'PUT' && response.ok())
  await page.getByRole('button', { name: 'Mit Bestellservice verbinden' }).click()
  await placementEdge
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
  await change(page, '/diagrams/', 'PUT', async () => {
    await page.getByRole('button', { name: 'Kante Kundenportal → Bestellservice' }).click()
    await page.getByLabel('Bezeichnung').fill('ruft auf')
    await page.getByLabel('Protokoll').fill('HTTPS')
  })

  await openSection(page, 'Systemarchitektur')
  await createDiagram(page, 'Laufzeit')
  await change(page, '/diagrams/', 'PUT', async () => {
    await page.getByRole('button', { name: 'Bestellservice', exact: true }).click()
  })
  await openSection(page, 'Systemarchitektur')
  await page.getByRole('link', { name: 'Komponenten' }).click()
  await page.getByRole('link', { name: /Bestellservice/ }).click()
  const renamed = page.waitForResponse((response) => response.url().includes('/components/') && response.request().method() === 'PATCH' && response.ok())
  await page.getByLabel('Name').fill('Bestelldienst')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await renamed
  await openSection(page, 'Systemarchitektur')
  await page.getByRole('link', { name: 'Kontext' }).click()
  await expect(page.getByRole('button', { name: 'Komponente: Bestelldienst' })).toBeVisible()
  await expect(page.getByRole('button', { name: /HTTPS|ruft auf/ })).toBeVisible()
  await openSection(page, 'Systemarchitektur')
  await page.getByRole('link', { name: 'Laufzeit' }).click()
  await expect(page.getByRole('button', { name: 'Komponente: Bestelldienst' })).toBeVisible()
  await page.locator('li').filter({ hasText: 'Komponente: Bestelldienst' }).getByRole('button', { name: 'Löschen' }).click()
  await page.getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Komponente: Bestelldienst' })).toHaveCount(0)
  await openSection(page, 'Systemarchitektur')
  await page.getByRole('link', { name: 'Kontext' }).click()
  await expect(page.getByRole('button', { name: 'Komponente: Bestelldienst' })).toBeVisible()
  await openSection(page, 'Systemarchitektur')
  await page.getByRole('link', { name: 'Komponenten' }).click()
  await page.getByRole('link', { name: /Bestelldienst/ }).click()
  await expect(page.getByRole('heading', { name: 'Komponente' })).toBeVisible()
  await expect(page.getByText('1 Platzierungen. Eine Umbenennung')).toBeVisible()

  await openSection(page, 'Prozesse')
  await createDiagram(page, 'Freigabeablauf')
  for (const tool of ['Start', 'Entscheidung', 'Aktion', 'Ende']) {
    await change(page, '/diagrams/', 'PUT', async () => {
      await page.getByRole('complementary').getByRole('button', { name: tool, exact: true }).click()
    })
  }
  await connect(page, 'Start: Start', 'Entscheidung')
  await connect(page, 'Entscheidung: Entscheidung', 'Aktion')
  await connect(page, 'Entscheidung: Entscheidung', 'Ende')
  await connect(page, 'Aktion: Aktion', 'Ende')
  await change(page, '/diagrams/', 'PUT', async () => {
    await page.getByRole('button', { name: 'Kante Entscheidung → Aktion' }).click()
    await page.getByLabel('Bedingung').fill('Freigegeben')
    await page.getByRole('button', { name: 'Kante Entscheidung → Ende' }).click()
    await page.getByLabel('Bedingung').fill('Abgelehnt')
  })
  await change(page, '/diagrams/', 'PUT', async () => {
    await page.getByRole('button', { name: 'Aktion: Aktion' }).click()
    await page.getByLabel('Titel').fill('Freigabe prüfen')
  })
  await expect(page.getByText('Keine Modellierungshinweise')).toBeVisible()
  const position = await page.getByText(/^Position /).textContent()
  await linkTo(page, 'Erfüllt', 'REQ-001', /Anforderung: REQ-001/)
  await linkTo(page, 'Verwendet', 'Freigabemaske', /Screen: Freigabemaske/)
  await linkTo(page, 'Verwendet', 'Bestelldienst', /Komponente: Bestelldienst/)

  await openSection(page, 'Prozesse')
  await createDiagram(page, 'Meldungen')
  await change(page, '/diagrams/', 'PUT', async () => {
    await page.getByRole('complementary').getByRole('button', { name: 'Ereignis', exact: true }).click()
  })
  await change(page, '/diagrams/', 'PUT', async () => {
    await page.getByRole('button', { name: 'Ereignis: Ereignis' }).click()
    await page.getByLabel('Titel').fill('VersandAusgelöst')
  })
  await openSection(page, 'Prozesse')
  await page.getByRole('link', { name: 'Freigabeablauf' }).click()
  await page.getByRole('button', { name: 'Aktion: Freigabe prüfen' }).click()
  await linkTo(page, 'Löst aus', 'Versand', /Prozessschritt: VersandAusgelöst/)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Kante Entscheidung → Freigabe prüfen: Freigegeben' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kante Entscheidung → Ende: Abgelehnt' })).toBeVisible()
  await page.getByRole('button', { name: 'Aktion: Freigabe prüfen' }).click()
  await expect(page.getByText(position!)).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Löst aus' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'VersandAusgelöst' })).toBeVisible()

  await page.goto(requirementUrl)
  await expect(page.getByText('Wird erfüllt durch')).toBeVisible()
  await page.getByRole('link', { name: 'Freigabe prüfen' }).click()
  await expect(page).toHaveURL(/diagramme\/.+node=/)
  await expect(page.getByLabel('Titel')).toHaveValue('Freigabe prüfen')
  await expect(page.locator('.react-flow__node.selected')).toContainText('Freigabe prüfen')

  await page.locator('li').filter({ hasText: 'Ende: Ende' }).getByRole('button', { name: 'Löschen' }).click()
  await expect(page.getByRole('dialog')).toContainText('Kanten')
  await page.getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Kante Entscheidung → Ende/ })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Ende: Ende' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Kante Entscheidung → Ende/ })).toHaveCount(0)

  await openSection(page, 'Dokumentation')
  await page.getByRole('button', { name: 'Seite anlegen' }).click()
  await change(page, '/documents/', 'PUT', async () => {
    await page.getByLabel('Seitentitel').fill('Handbuch')
  })
  await openSection(page, 'Dokumentation')
  await page.getByRole('button', { name: 'Seite anlegen' }).click()
  await change(page, '/documents/', 'PUT', async () => {
    await page.getByLabel('Seitentitel').fill('Kapitel')
  })
  await page.getByLabel('Übergeordnete Seite').selectOption({ label: 'Handbuch' })
  await page.getByRole('button', { name: 'Verschieben' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Seite verschoben.' })).toBeVisible()
  await page.getByRole('link', { name: 'Handbuch' }).click()
  await page.getByLabel('Übergeordnete Seite').selectOption({ label: 'Kapitel' })
  await page.getByRole('button', { name: 'Verschieben' }).click()
  await expect(page.getByText('nicht unter eine ihrer eigenen Unterseiten')).toBeVisible()

  await openSection(page, 'Dokumentation')
  await page.getByRole('button', { name: 'Entscheidung anlegen' }).click()
  await expect(page.locator('.ProseMirror')).toContainText('Kontext')
  await expect(page.locator('.ProseMirror')).toContainText('Konsequenzen')
  await change(page, '/documents/', 'PUT', async () => {
    await page.getByLabel('Seitentitel').fill('Freigabeentscheidung')
  })
  await page.getByRole('button', { name: 'Artefaktlink' }).click()
  await page.getByRole('dialog').getByLabel('Artefakt suchen').fill('REQ-001')
  const linked = page.waitForResponse((response) => response.url().includes('/documents/') && response.request().method() === 'PUT' && response.ok())
  await page.getByRole('dialog').getByRole('button', { name: /REQ-001 Bestellung freigeben/ }).click()
  await linked
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
  await expect(page.locator('.ProseMirror')).toContainText('REQ-001 Bestellung freigeben')
  await change(page, '/documents/', 'PUT', async () => {
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' Zweite Änderung steht hier')
  })
  const revisionWithLink = page.getByRole('button', { name: /^3\./ })
  await expect(revisionWithLink).toBeVisible()
  await revisionWithLink.click()
  await expect(page.getByText('Revision 3')).toBeVisible()
  await expect(page.locator('pre')).toContainText('REQ-001')
  await expect(page.locator('pre')).not.toContainText('Zweite Änderung')
  await page.getByRole('button', { name: 'Als neue Revision wiederherstellen' }).click()
  await expect(page.locator('.ProseMirror')).toContainText('Kontext')
  await expect(page.locator('.ProseMirror')).toContainText('REQ-001 Bestellung freigeben')
  await expect(page.locator('.ProseMirror')).not.toContainText('Zweite Änderung')
  await page.locator('.ProseMirror a', { hasText: 'REQ-001 Bestellung freigeben' }).click()
  await expect(page.getByRole('heading', { name: 'REQ-001' })).toBeVisible()

  await page.getByLabel('Projektsuche').fill('Freigabe prüfen')
  await page.getByRole('button', { name: /Freigabe prüfen\s+Prozessschritt/ }).click()
  await expect(page).toHaveURL(/node=/)
  await expect(page.getByLabel('Titel')).toHaveValue('Freigabe prüfen')

  await openSection(page, 'Übersicht')
  await expect(page.getByRole('heading', { name: /0 ohne Prozessschritt/ })).toBeVisible()
  await page.getByRole('link', { name: /0 ohne Prozessschritt/ }).click()
  await expect(page.getByText('Keine Treffer für diese Filter')).toBeVisible()

  await page.goto(requirementUrl)
  await expect(page.getByLabel('Beschreibung')).toHaveValue('Eine Bestellung braucht eine Freigabe.')
  const other = await page.context().newPage()
  await other.goto(requirementUrl)
  await expect(other.getByLabel('Beschreibung')).toHaveValue('Eine Bestellung braucht eine Freigabe.')
  await change(other, '/requirements/', 'PATCH', async () => {
    await other.getByLabel('Beschreibung').fill('Vom zweiten Fenster gespeichert.')
  })
  const conflict = page.waitForResponse((response) => response.url().includes('/requirements/') && response.request().method() === 'PATCH')
  await page.getByLabel('Titel').fill('Lokaler Entwurf bleibt')
  expect((await conflict).status()).toBe(409)
  await expect(page.getByRole('alert')).toContainText('lokalen Änderungen bleiben erhalten')
  await expect(page.getByLabel('Titel')).toHaveValue('Lokaler Entwurf bleibt')
  await other.close()
})

test('Liste, Dokument und Fokus auf schmaler Breite', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Dieser Ablauf prüft die schmale Breite.')
  test.setTimeout(90_000)
  await register(page, `mobil-${Date.now()}@example.com`)
  await page.getByLabel('Name').fill('Mobilprojekt')
  await page.getByRole('button', { name: 'Projekt anlegen' }).click()
  await expect(page.getByRole('heading', { name: 'Mobilprojekt' })).toBeVisible()
  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)
  expect(outline).not.toBe('none')
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })

  await openSection(page, 'Prozesse')
  await expect(page.getByText('Keine Diagramme')).toBeVisible()
  await createDiagram(page, 'Mobilablauf')
  await page.getByRole('button', { name: 'Inspektor' }).click()
  await expect(page.getByText('per Tastatur nutzbar')).toBeVisible()
  await page.getByRole('button', { name: 'Schließen' }).click()

  await openSection(page, 'Dokumentation')
  await expect(page.getByText('Noch keine Seiten')).toBeVisible()
  await page.getByRole('button', { name: 'Seite anlegen' }).click()
  await change(page, '/documents/', 'PUT', async () => {
    await page.getByLabel('Seitentitel').fill('Mobilhandbuch')
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Mobilnotiz')
  })
  await page.getByLabel('Projektsuche').fill('Mobilnotiz')
  await page.getByRole('button', { name: /Mobilhandbuch\s+Seite/ }).click()
  await expect(page.getByLabel('Seitentitel')).toHaveValue('Mobilhandbuch')
})

test('Demo-Projekt zeigt den vorbereiteten Ablauf', async ({ page }) => {
  const email = process.env.STUDIO_DEMO_EMAIL
  const demoPassword = process.env.STUDIO_DEMO_PASSWORD
  test.skip(!email || !demoPassword, 'Demo-Zugangsdaten sind nur im ausdrücklich aktivierten Entwicklungsmodus gesetzt.')
  await page.goto('/anmelden')
  await page.getByLabel('E-Mail').fill(email!)
  await page.getByLabel('Passwort').fill(demoPassword!)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await page.getByRole('link', { name: /Kundenportal/ }).click()
  await expect(page.getByRole('heading', { name: 'Kundenportal' })).toBeVisible()
  await openSection(page, 'Anforderungen')
  await expect(page.getByRole('link', { name: /REQ-002 Bestellung freigeben/ }).first()).toBeVisible()
  await page.getByLabel('Projektsuche').fill('ADR-001')
  await page.getByRole('button', { name: /ADR-001 Freigabe/ }).click()
  await expect(page.locator('.ProseMirror')).toContainText('Kontext')
  await expect(page.locator('.ProseMirror')).toContainText('REQ-002 Bestellung freigeben')
})

test('Ladefehler nennt die fehlgeschlagene Verbindung', async ({ page }) => {
  await register(page, `fehler-${Date.now()}-${test.info().project.name}@example.com`)
  await page.getByLabel('Name').fill('Fehlerprojekt')
  await page.getByRole('button', { name: 'Projekt anlegen' }).click()
  await expect(page.getByRole('heading', { name: 'Fehlerprojekt' })).toBeVisible()
  await page.route('**/api/v1/projects/*/requirements**', (route) => route.abort())
  await openSection(page, 'Anforderungen')
  await expect(page.getByRole('alert')).toContainText('Verbindung zur Anwendung ist fehlgeschlagen')
  await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible()
})

async function register(page: Page, email: string) {
  await page.goto('/registrieren')
  await page.getByLabel('Name').fill('Testperson')
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort').fill(password)
  await page.getByRole('button', { name: 'Registrieren' }).click()
  await expect(page.getByRole('heading', { name: 'Projekte' })).toBeVisible()
}

async function openSection(page: Page, name: string) {
  const link = page.getByRole('navigation', { name: 'Projekt' }).getByRole('link', { name, exact: true })
  if (!(await link.isVisible())) {
    await page.getByRole('button', { name: 'Navigation öffnen' }).click()
  }
  await page.getByRole('navigation', { name: 'Projekt' }).getByRole('link', { name, exact: true }).click()
}

async function change(page: Page, urlPart: string, method: string, action: () => Promise<void>) {
  const done = page.waitForResponse((response) => response.url().includes(urlPart) && response.request().method() === method && response.ok())
  await action()
  await done
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
}

async function connect(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: from, exact: true }).click()
  const done = page.waitForResponse((response) => response.url().includes('/diagrams/') && response.request().method() === 'PUT' && response.ok())
  await page.getByRole('button', { name: `Mit ${to} verbinden` }).click()
  await done
}

async function linkTo(page: Page, relation: string, term: string, result: RegExp) {
  await page.getByLabel('Beziehungsart').selectOption({ label: relation })
  await page.getByLabel('Ziel suchen').fill(term)
  await page.getByRole('button', { name: result }).click()
  await expect(page.getByText('Verknüpfung gespeichert.')).toBeVisible()
}

async function createDiagram(page: Page, name: string) {
  await page.getByRole('button', { name: 'Diagramm anlegen' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByLabel('Diagrammname')).toHaveValue(name)
}

async function createScreen(page: Page, name: string, route: string) {
  await openSection(page, 'UI-Planung')
  await page.getByRole('button', { name: 'Screen anlegen' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Route').fill(route)
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

async function createComponent(page: Page, name: string, kind: string) {
  await page.getByRole('button', { name: 'Komponente anlegen' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Art').selectOption(kind)
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
}
