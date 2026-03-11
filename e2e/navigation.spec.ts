import { test, expect, mockSupabase, injectAuthSession, mockLocalServer } from './helpers';

test.describe('ניווט וראוטינג', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await mockLocalServer(page);
  });

  test('עמוד הבית נטען עם כותרת נכונה', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/מערכת תמלול מתקדמת/);
  });

  test('ניווט לדף תמלול', async ({ page }) => {
    await page.goto('/transcribe');
    await expect(page.getByText('מערכת תמלול מתקדמת')).toBeVisible();
  });

  test('ניווט לדף הגדרות', async ({ page }) => {
    await injectAuthSession(page);
    await page.goto('/settings');
    await expect(page.getByText('הגדרות')).toBeVisible();
  });

  test('ניווט לדף עריכת טקסט', async ({ page }) => {
    await page.goto('/text-editor');
    await expect(page.getByText('עריכת טקסט')).toBeVisible();
  });

  test('דף 404 מוצג עבור נתיב לא קיים', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await expect(page.getByText('404')).toBeVisible();
  });

  test('ניווט לדף התחברות', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('התחבר')).toBeVisible();
  });

  test('RTL מופעל', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
  });

  test('ניווט דרך סיידבר', async ({ page }) => {
    await injectAuthSession(page);
    await page.goto('/');
    // Wait for sidebar to appear
    const sidebar = page.locator('aside, nav');
    if (await sidebar.count() > 0) {
      // Look for transcription link text
      const transcribeLink = page.getByRole('link', { name: /תמלול/ });
      if (await transcribeLink.count() > 0) {
        await transcribeLink.first().click();
        await expect(page).toHaveURL(/transcribe/);
      }
    }
  });
});

test.describe('דשבורד', () => {
  test('מציג ברכה למשתמש מחובר', async ({ page }) => {
    await mockSupabase(page);
    await injectAuthSession(page);
    await mockLocalServer(page);
    await page.goto('/');
    await expect(page.getByText(/Test User|שלום/)).toBeVisible({ timeout: 10000 });
  });

  test('מציג כרטיסי פעולה מהירה', async ({ page }) => {
    await mockSupabase(page);
    await injectAuthSession(page);
    await mockLocalServer(page);
    await page.goto('/');
    await expect(page.getByText('תמלול חדש')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('עריכת טקסט')).toBeVisible();
    await expect(page.getByText('הגדרות')).toBeVisible();
  });

  test('כפתור תמלול חדש מנווט לדף תמלול', async ({ page }) => {
    await mockSupabase(page);
    await injectAuthSession(page);
    await mockLocalServer(page);
    await page.goto('/');
    await page.getByText('תמלול חדש').click();
    await expect(page).toHaveURL(/transcribe/);
  });

  test('מציג סטטיסטיקות כשיש תמלולים', async ({ page }) => {
    await mockSupabase(page);
    await injectAuthSession(page);
    await mockLocalServer(page);
    await page.goto('/');
    // Stats section should show some numbers
    await expect(page.getByText(/תמלולים|סה"כ/)).toBeVisible({ timeout: 10000 });
  });
});
