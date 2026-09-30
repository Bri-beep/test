import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SupportContact } from "../src/components/app-shell/support-contact";

test("Valiuz icon is also used as the browser favicon", async () => {
  const [logo, favicon] = await Promise.all([
    readFile("public/valiuz-logo-icon.svg", "utf8"),
    readFile("public/favicon.svg", "utf8"),
  ]);

  assert.equal(favicon, logo);
  assert.match(logo, /gradient-valiuz/);
});

test("shell exposes the 2026 brand tokens and self-hosted typeface", async () => {
  const [styles, layout, header] = await Promise.all([
    readFile("src/client/globals.css", "utf8"),
    readFile("src/client/main.tsx", "utf8"),
    readFile("src/components/app-shell/app-header.tsx", "utf8"),
  ]);

  for (const color of ["#212222", "#ff9d00", "#ff494a", "#58b89c", "#835cb7", "#627c89", "#b5bfc1"]) {
    assert.match(styles, new RegExp(color));
  }
  assert.match(styles, /--brand-gradient: linear-gradient/);
  assert.match(layout, /@fontsource-variable\/outfit/);
  assert.match(header, /width=\{1781\}/);
  assert.match(header, /height=\{2192\}/);
  assert.match(header, /style=\{\{ height: "3\.5rem", width: "auto" \}\}/);
});

test("support contact exposes the configured Valiuz Slack destination", () => {
  const html = renderToStaticMarkup(
    createElement(SupportContact, {
      name: "Alexis",
      slackUrl: "https://valiuz.slack.com/team/U123456",
    }),
  );

  assert.match(html, /Contacter Alexis sur Slack/);
  assert.match(html, /https:\/\/valiuz\.slack\.com\/team\/U123456/);
  assert.match(html, /target="_blank"/);
});
