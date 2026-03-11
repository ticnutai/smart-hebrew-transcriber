import { test, expect, mockSupabase, injectAuthSession, mockLocalServer, MOCK_USER } from './helpers';

test.describe('התחברות', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page, { authenticated: false });
    await mockLocalServer(page);
  });

  test('דף התחברות מוצג עם שדות אימייל וסיסמה', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByPlaceholder(/אימייל|email|דוא/i)).toBeVisible();
    await expect(page.getByPlaceholder(/סיסמ|password/i)).toBeVisible();
  });

  test('כפתור Google מוצג', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/Google|גוגל/)).toBeVisible();
  });

  test('מעבר בין התחבר להרשמה', async ({ page }) => {
    await page.goto('/login');
    // Should show "הרשם עכשיו" or "הרשמה" toggle
    const signupToggle = page.getByText(/הרשם|הרשמה/);
    await expect(signupToggle.first()).toBeVisible();
    await signupToggle.first().click();
    // Should now show sign up form
    await expect(page.getByText(/הרשמה/)).toBeVisible();
  });

  test('וולידציית סיסמה קצרה', async ({ page }) => {
    await page.goto('/login');
    // Try to switch to sign up mode
    const signupToggle = page.getByText(/הרשם|הרשמה/);
    if (await signupToggle.count() > 0) {
      await signupToggle.first().click();
    }
    const emailInput = page.getByPlaceholder(/אימייל|email|דוא/i);
    const passwordInput = page.getByPlaceholder(/סיסמ|password/i);
    await emailInput.fill('test@example.com');
    await passwordInput.fill('12');
    const submitButton = page.getByRole('button', { name: /התחבר|הרשמה|כניסה/i });
    await submitButton.click();
    // Should show validation error or toast
    await expect(page.getByText(/6|שש|קצר|שגיאה|error/i)).toBeVisible({ timeout: 5000 });
  });

  test('התחברות מוצלחת מנווטת לדשבורד', async ({ page }) => {
    // Re-mock with authenticated: true for the token request
    await mockSupabase(page, { authenticated: true });
    await page.goto('/login');
    const emailInput = page.getByPlaceholder(/אימייל|email|דוא/i);
    const passwordInput = page.getByPlaceholder(/סיסמ|password/i);
    await emailInput.fill('test@example.com');
    await passwordInput.fill('password123');
    const submitButton = page.getByRole('button', { name: /התחבר|כניסה/i });
    await submitButton.click();
    // Should navigate away from login
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });

  test('הצגת/הסתרת סיסמה עובדת', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.getByPlaceholder(/סיסמ|password/i);
    await expect(passwordInput).toHaveAttribute('type', 'password');
    // Click eye toggle
    const eyeButton = page.locator('button').filter({ has: page.locator('svg') }).nth(0);
    // Find the eye button near the password field
    const passwordContainer = passwordInput.locator('..');
    const toggle = passwordContainer.locator('button');
    if (await toggle.count() > 0) {
      await toggle.first().click();
      await expect(passwordInput).toHaveAttribute('type', 'text');
    }
  });
});

test.describe('התנתקות', () => {
  test('התנתקות מנקה session ומנווטת להתחברות', async ({ page }) => {
    await mockSupabase(page, { authenticated: true });
    await injectAuthSession(page);
    await mockLocalServer(page);
    await page.goto('/settings');
    // Find and click logout button
    const logoutButton = page.getByText(/התנתק/);
    await expect(logoutButton).toBeVisible({ timeout: 10000 });
    await logoutButton.click();
    // Should navigate to login or home
    await expect(page).toHaveURL(/login|\/$/);
  });
});

test.describe('הגנת עמודים', () => {
  test('הגדרות מפנה להתחברות בלי session', async ({ page }) => {
    await mockSupabase(page, { authenticated: false });
    await mockLocalServer(page);
    await page.goto('/settings');
    // Should redirect to login or show login prompt
    await expect(page.getByText(/התחבר|login|כניסה/i)).toBeVisible({ timeout: 10000 });
  });
});
