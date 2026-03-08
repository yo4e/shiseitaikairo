import { expect, test } from "@playwright/test";

type StatsResponse = {
  ok: boolean;
  total_count?: number;
};

test.describe.configure({ mode: "serial" });

test("simulator publish -> cabinet -> detail -> like/report smoke", async ({ page, request }) => {
  const beforeStatsResponse = await request.get("/api/specimens/stats");
  expect(beforeStatsResponse.ok()).toBeTruthy();
  const beforeStats = (await beforeStatsResponse.json()) as StatsResponse;
  const beforeTotalCount = Number(beforeStats.total_count || 0);

  await page.goto("/app/index.html");
  await page.getByRole("button", { name: "庭園で始める" }).click();
  await page.getByRole("button", { name: "生態系を回す" }).click();

  await expect(page.locator("#interaction-status")).toContainText("生態系の実行完了:");
  await expect(page.locator("#winner-detail")).toContainText("今回の汚染語:");
  await expect(page.locator("#winner-detail")).toContainText("検出された毒語:");

  const publishButton = page
    .locator("#specimen-list button[data-action='publish-specimen']")
    .first();
  await expect(publishButton).toBeVisible();
  await publishButton.click();

  await expect(page.locator("#interaction-status")).toContainText("投稿完了:");
  const interactionText = await page.locator("#interaction-status").textContent();
  const specimenId = interactionText?.match(/投稿完了:\s*(S-[0-9A-Z-]+)/)?.[1] || "";
  expect(specimenId).toMatch(/^S-/);
  const collectorId = await page.evaluate(
    () => window.localStorage.getItem("shisei:collector-id") || "",
  );
  expect(collectorId).toMatch(/^C-/);

  const publishedNote = page.locator("#specimen-list .published-note").first();
  await expect(publishedNote).toContainText(specimenId);
  const detailHref = await publishedNote
    .getByRole("link", { name: "標本詳細を開く" })
    .getAttribute("href");
  expect(detailHref).toBeTruthy();

  await page.goto("/cabinet?view=new");
  await expect(page.locator("#cabinet-status")).toContainText("API表示しています。");
  await expect(page.locator("#cabinet-total-count")).toContainText(
    `公開標本数: ${beforeTotalCount + 1}件`,
  );

  const createdCard = page
    .locator("#new-specimens .specimen-card")
    .filter({ hasText: specimenId })
    .first();

  await expect(createdCard).toBeVisible();
  await expect(createdCard).toContainText(collectorId);
  await expect(createdCard).toContainText("いいね: 0");
  await createdCard.getByRole("link", { name: "詳細" }).click();

  await page.waitForURL(
    (url) => url.pathname === "/specimen/" && url.searchParams.get("id") === specimenId,
  );
  await expect(page.locator("#specimen-status")).toContainText("APIから標本を読み込みました。");
  await expect(page.locator("#specimen-title")).toContainText(specimenId);
  await expect(page.locator("#specimen-meta")).toContainText(collectorId);
  await expect(page.locator("#specimen-poem")).not.toContainText("読み込み中...");
  await expect(page.locator("#specimen-diagnosis")).toContainText("代謝スコア");
  await expect(page.locator("#specimen-diagnosis")).toContainText("反復ペナルティ");
  await expect(page.locator("#specimen-genome-rows")).toContainText("行数");
  await expect(page.locator("#specimen-genome-rows")).toContainText("目標字数");
  await expect(page.locator("#specimen-parents")).not.toContainText("読み込み中...");
  await expect(page.locator("#specimen-chips")).toContainText("いいね 0");
  await expect(page.locator("#specimen-chips")).toContainText("通報 0");

  await page.getByRole("button", { name: "いいね" }).click();
  await expect(page.locator("#specimen-status")).toContainText("いいねを送信しました。");
  await expect(page.locator("#specimen-chips")).toContainText("いいね 1");

  await page.getByRole("button", { name: "通報" }).click();
  await expect(page.locator("#specimen-status")).toContainText("通報を送信しました。");
  await expect(page.locator("#specimen-chips")).toContainText("通報 1");
});
