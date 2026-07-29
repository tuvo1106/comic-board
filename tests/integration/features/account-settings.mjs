// Account settings (item 6): change email/password via the account menu.
// Both round-trip back to the seed values — nothing later in this run
// re-authenticates, but staying self-contained is cheap and safer if test
// order ever changes.
export async function changeEmailAndPassword({ p, ck, sleep, env, toastSays }) {
  await p.click(`button[title='${env.SEED_USER_EMAIL}']`);
  await sleep(300);
  const [settingsItem] = await p.$$("xpath/.//button[normalize-space(.)='Account settings']");
  await settingsItem.click();
  await sleep(400);

  const clickSubmit = async (label) => {
    const [btn] = await p.$$(`xpath/.//button[normalize-space(.)='${label}']`);
    await btn.click();
  };

  // Email: seed -> temp -> back to seed.
  await p.type("[role='dialog'] input[type='email']", "temp@example.com");
  await clickSubmit("Update email");
  await sleep(500);
  ck(await toastSays("Email updated"), "change-email shows a success toast");
  await p.type("[role='dialog'] input[type='email']", env.SEED_USER_EMAIL);
  await clickSubmit("Update email");
  await sleep(500);

  // Password: seed -> temp -> back to seed. "Current password" is the
  // password input with no placeholder; "New password" has one.
  const tempPassword = "temp-pass-456";
  await p.type("[role='dialog'] input[type='password']:not([placeholder])", env.SEED_USER_PASSWORD);
  await p.type("[role='dialog'] input[placeholder='At least 8 characters']", tempPassword);
  await clickSubmit("Update password");
  await sleep(500);
  ck(await toastSays("Password updated"), "change-password shows a success toast");
  await p.type("[role='dialog'] input[type='password']:not([placeholder])", tempPassword);
  await p.type("[role='dialog'] input[placeholder='At least 8 characters']", env.SEED_USER_PASSWORD);
  await clickSubmit("Update password");
  await sleep(500);

  await p.keyboard.press("Escape");
  await sleep(300);
}
