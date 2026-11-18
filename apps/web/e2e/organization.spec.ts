import { expect, test, type Page } from '@playwright/test'

const password = 'Planung-Test-1'

test('zwei Abläufe derselben Komponente sind vom Überblick aus erreichbar', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Die grafische Bearbeitung ist für den Desktop ausgelegt.')
  test.setTimeout(180_000)
  await register(page, `bereiche-${Date.now()}@example.com`)
  await page.getByLabel('Name').fill('Großprojekt')
  await page.getByRole('button', { name: 'Projekt anlegen' }).click()
  await expect(page.getByRole('heading', { name: 'Großprojekt' })).toBeVisible()

  await openSection(page, 'Bereiche')
  await createArea(page, 'Bestellung', 'Auftrag bis zur Freigabe')
  await createArea(page, 'Versand', 'Übergabe an den Versand')

  await openSection(page, 'Systemarchitektur')
  await page.getByRole('link', { name: 'Komponenten' }).click()
  await createComponent(page, 'Bestell-API')

  await openSection(page, 'Prozesse')
  await createDiagram(page, 'Auftrag annehmen', 'Bestellung')
  await addAction(page, 'Prüfen')
  await linkUses(page, 'Bestell-API', 'prüft die Bestellung über die API')

  await openSection(page, 'Prozesse')
  await createDiagram(page, 'Versand starten', 'Versand')
  await addAction(page, 'Versenden')
  await linkUses(page, 'Bestell-API', 'meldet den Versand an die API')

  await openSection(page, 'Prozesse')
  await page.getByLabel('Bereich filtern').selectOption({ label: 'Bestellung' })
  await expect(page.getByRole('link', { name: 'Auftrag annehmen' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Versand starten' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ansicht speichern' }).click()
  const view = page.getByRole('dialog')
  await view.getByLabel('Name der Ansicht').fill('Nur Bestellung')
  await view.getByRole('button', { name: 'Speichern' }).click()
  await expect(view).toBeHidden()
  await page.getByLabel('Bereich filtern').selectOption({ label: 'Alle Bereiche' })
  await expect(page.getByRole('link', { name: 'Versand starten' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Gespeicherte Ansichten' }).getByRole('link', { name: 'Nur Bestellung' }).click()
  await expect(page.getByRole('link', { name: 'Auftrag annehmen' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Versand starten' })).toHaveCount(0)

  await openSection(page, 'Systemarchitektur')
  await page.getByRole('link', { name: 'Komponenten' }).click()
  await page.getByRole('link', { name: /Bestell-API/ }).click()
  const impact = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Auswirkung auf Abläufe' }) })
  await expect(impact.getByText('prüft die Bestellung über die API')).toBeVisible()
  await expect(impact.getByText('meldet den Versand an die API')).toBeVisible()
  await page.getByLabel('Name').fill('Bestelldienst')
  const renamed = page.waitForResponse((response) => response.url().includes('/components/') && response.request().method() === 'PATCH' && response.ok())
  await page.getByRole('button', { name: 'Speichern' }).click()
  await renamed
  await expect(page.getByRole('link', { name: /Auftrag annehmen: Prüfen/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Versand starten: Versenden/ })).toBeVisible()

  await openSection(page, 'Übersicht')
  await expect(page.getByRole('heading', { name: 'Gemeinsam genutzte Komponenten' })).toBeVisible()
  const shared = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Gemeinsam genutzte Komponenten' }) })
  await expect(shared.getByRole('link', { name: 'Bestelldienst' })).toBeVisible()
  await expect(shared.getByText('prüft die Bestellung über die API')).toBeVisible()
  await expect(shared.getByText('meldet den Versand an die API')).toBeVisible()
  await page.getByRole('link', { name: /Auftrag annehmen: Prüfen/ }).click()
  await expect(page).toHaveURL(/diagramme\/.+node=/)
  await expect(page.getByLabel('Titel')).toHaveValue('Prüfen')
  await expect(page.locator('.react-flow__node.selected')).toContainText('Prüfen')
})

async function register(page: Page, email: string) {
  await page.goto('/registrieren')
  await page.getByLabel('Name').fill('Testperson')
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort', { exact: true }).fill(password)
  await page.getByLabel('Passwort wiederholen').fill(password)
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

async function createArea(page: Page, name: string, description: string) {
  await page.getByRole('button', { name: 'Bereich anlegen' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Beschreibung').fill(description)
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

async function createComponent(page: Page, name: string) {
  await page.getByRole('button', { name: 'Komponente anlegen' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Art').selectOption('Api')
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(dialog).toBeHidden()
}

async function createDiagram(page: Page, name: string, area: string) {
  await page.getByRole('button', { name: 'Diagramm anlegen' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Bereich').selectOption({ label: area })
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByLabel('Diagrammname')).toHaveValue(name)
  await expect(page.getByLabel('Bereich')).toHaveValue(/.+/)
}

async function addAction(page: Page, title: string) {
  const created = page.waitForResponse((response) => response.url().includes('/diagrams/') && response.request().method() === 'PUT' && response.ok())
  await page.getByRole('complementary').getByRole('button', { name: 'Aktion', exact: true }).click()
  await created
  const renamed = page.waitForResponse((response) => response.url().includes('/diagrams/') && response.request().method() === 'PUT' && response.ok())
  await page.getByRole('button', { name: 'Aktion: Aktion' }).click()
  await page.getByLabel('Titel').fill(title)
  await renamed
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
}

async function linkUses(page: Page, component: string, rationale: string) {
  await page.getByLabel('Beziehungsart').selectOption({ label: 'Verwendet' })
  await page.getByLabel('Begründung').fill(rationale)
  await page.getByLabel('Ziel suchen').fill(component)
  const result = page.getByRole('button', { name: new RegExp(`Komponente: ${component}`) })
  await expect(result).toBeVisible()
  await result.click()
  await expect(page.getByText('Verknüpfung gespeichert.')).toBeVisible()
  await expect(page.getByText(rationale)).toBeVisible()
}
