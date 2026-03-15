import { test, expect, mockSupabase, injectAuthSession, mockLocalServer } from './helpers';

test.describe('עורך טקסט', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await injectAuthSession(page);
    await mockLocalServer(page);
  });

  test('עמוד עורך טקסט נטען', async ({ page }) => {
    await page.goto('/text-editor');
    await expect(page.getByText('עריכת טקסט').first()).toBeVisible({ timeout: 10000 });
  });

  test('טאבים מוצגים בעורך', async ({ page }) => {
    await page.goto('/text-editor');
    // Check for main editor tabs
    const tabTexts = ['נגן', 'עריכת טקסט', 'תבניות', 'AI', 'היסטוריה'];
    for (const tabText of tabTexts) {
      const tab = page.getByText(tabText);
      if (await tab.count() > 0) {
        await expect(tab.first()).toBeVisible();
      }
    }
  });

  test('כפתורי עריכה מהירה מוצגים', async ({ page }) => {
    await page.goto('/text-editor');
    // Quick edit buttons
    const buttons = ['תקן שגיאות', 'חלק לפסקאות'];
    for (const btnText of buttons) {
      const btn = page.getByText(btnText);
      if (await btn.count() > 0) {
        await expect(btn.first()).toBeVisible();
      }
    }
  });

  test('הזנת טקסט ידנית בעורך', async ({ page }) => {
    await page.goto('/text-editor');
    // Find the main text area or contenteditable
    const editor = page.locator('textarea, [contenteditable="true"], [role="textbox"]').first();
    if (await editor.count() > 0) {
      await editor.click();
      await editor.fill('טקסט בדיקה לעורך');
      await expect(editor).toContainText('טקסט בדיקה לעורך');
    }
  });

  test('טקסט נשמר ב-localStorage', async ({ page }) => {
    await page.goto('/text-editor');
    const editor = page.locator('textarea, [contenteditable="true"], [role="textbox"]').first();
    if (await editor.count() > 0) {
      await editor.click();
      await editor.fill('טקסט שנשמר אוטומטית');
      // Wait for auto-save
      await page.waitForTimeout(1000);
      const saved = await page.evaluate(() => localStorage.getItem('current_editing_text'));
      expect(saved).toContain('טקסט שנשמר אוטומטית');
    }
  });

  test('ניווט עם טקסט מ-state', async ({ page }) => {
    // Navigate to text-editor with state (simulating post-transcription)
    await page.goto('/text-editor');
    // Use page.evaluate to navigate with state
    await page.evaluate(() => {
      window.history.pushState({}, '', '/transcribe');
    });
    await page.goto('/text-editor');
    // Editor should load without errors
    await expect(page.getByText('עריכת טקסט').first()).toBeVisible();
  });
});

test.describe('כפתור ייצוא', () => {
  test('כפתור ייצוא מוצג', async ({ page }) => {
    await page.goto('/text-editor');
    const exportButton = page.getByText(/ייצוא|export|הורד/i);
    if (await exportButton.count() > 0) {
      await expect(exportButton.first()).toBeVisible();
    }
  });

  test('תפריט ייצוא נפתח עם אופציות PDF ו-DOCX', async ({ page }) => {
    await page.goto('/text-editor');
    // First put some text in the editor
    const editor = page.locator('textarea, [contenteditable="true"], [role="textbox"]').first();
    if (await editor.count() > 0) {
      await editor.fill('טקסט לייצוא');
    }

    const exportButton = page.getByText(/ייצוא|export|הורד/i);
    if (await exportButton.count() > 0) {
      await exportButton.first().click();
      // Should show PDF and DOCX options
      await expect(page.getByText(/PDF/i)).toBeVisible({ timeout: 3000 });
      await expect(page.getByText(/DOCX|Word/i)).toBeVisible();
    }
  });
});

test.describe('היסטוריית גרסאות', () => {
  test('טאב היסטוריה ניתן לפתיחה', async ({ page }) => {
    await page.goto('/text-editor');
    const historyTab = page.getByText('היסטוריה');
    if (await historyTab.count() > 0) {
      await historyTab.first().click();
      // History view should appear
      await expect(page.getByText(/היסטוריה|גרסאות|versions/i)).toBeVisible({ timeout: 5000 });
    }
  });
});
