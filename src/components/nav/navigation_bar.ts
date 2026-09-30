/*  Site navigation bar: the behavior for the nav at the top of every page (logo, page
    links, and the Menu button shown on small screens). Opens and closes the menu, closes it
    when a link is clicked or Escape is pressed, and turns on Vercel Analytics page-view
    counting. Each page's HTML loads this file directly. */
import { inject } from "@vercel/analytics";

inject();

const menuToggle = document.querySelector<HTMLButtonElement>(".menu-toggle");
const siteMenu = document.querySelector<HTMLDivElement>(".site-menu");

if (menuToggle && siteMenu) {
  const closeMenu = () => {
    menuToggle.setAttribute("aria-expanded", "false");
    siteMenu.classList.remove("is-open");
  };

  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    siteMenu.classList.toggle("is-open", !isOpen);
  });

  siteMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

// Light/dark switch. A script in each page's <head> applies the theme early (the saved
// choice, or the system setting if there isn't one); this keeps the button's label in step,
// saves new choices, and follows system changes until the visitor picks one.
const themeToggle = document.querySelector<HTMLButtonElement>(".theme-toggle");

if (themeToggle) {
  const root = document.documentElement;
  const label = themeToggle.querySelector(".theme-toggle-label");

  const showTheme = (isLight: boolean) => {
    if (isLight) root.dataset.theme = "light";
    else delete root.dataset.theme;
    const next = isLight ? "Dark mode" : "Light mode";
    themeToggle.setAttribute("aria-label", `Switch to ${next.toLowerCase()}`);
    if (label) label.textContent = next;
  };

  showTheme(root.dataset.theme === "light");

  const systemLight = window.matchMedia("(prefers-color-scheme: light)");
  systemLight.addEventListener("change", (event) => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {
      // Storage blocked: nothing saved, so follow the system.
    }
    if (!saved) showTheme(event.matches);
  });

  themeToggle.addEventListener("click", () => {
    const isLight = root.dataset.theme !== "light";
    showTheme(isLight);
    try {
      localStorage.setItem("theme", isLight ? "light" : "dark");
    } catch {
      // Storage can be blocked (e.g. private browsing); the theme still applies for this page.
    }
  });
}
