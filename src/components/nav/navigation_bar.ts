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
