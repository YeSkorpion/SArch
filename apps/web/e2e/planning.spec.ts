import { expect, test } from '@playwright/test'

const password = 'Planung-Test-1'

test('Anmeldung, Anforderung und leere Zustände', async ({ page }, info) => {
  const email = `plan-${info.project.name}-${Date.now()}@example.com`
  await page.goto('/registrieren')
  await page.getByLabel('Name').fill('Testperson')
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort', { exact: true }).fill(password)
  await page.getByLabel('Passwort wiederholen').fill(password)
  await page.getByRole('button', { name: 'Registrieren' }).click()
  await expect(page.getByRole('heading', { name: 'Projekte' })).toBeVisible()

  await page.getByRole('button', { name: 'Projekt anlegen' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill(`Portal ${info.project.name}`)
  await page.getByRole('dialog').getByRole('button', { name: 'Projekt anlegen' }).click()
  await expect(page.getByRole('heading', { name: `Portal ${info.project.name}` })).toBeVisible()

  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Navigation öffnen' }).click()
    await page.getByRole('link', { name: 'Anforderungen' }).click()
  } else {
    await page.getByRole('link', { name: 'Anforderungen' }).click()
  }
  await expect(page.getByText('Keine Anforderungen')).toBeVisible()
  await page.getByRole('button', { name: 'Anforderung anlegen' }).click()
  await page.getByLabel('Titel').fill('Bestellung freigeben')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('REQ-001 Bestellung freigeben')).toBeVisible()
  await page.reload()
  await expect(page.getByText('REQ-001 Bestellung freigeben')).toBeVisible()
})

test('fehlgeschlagene Anmeldung bleibt allgemein', async ({ page }) => {
  await page.goto('/anmelden')
  await page.getByLabel('E-Mail').fill('niemand@example.com')
  await page.getByLabel('Passwort').fill('falsch-Falsch-1')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByRole('alert')).toContainText('Anmeldung fehlgeschlagen')
})
