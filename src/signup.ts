import "./styles.css";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const form = document.querySelector<HTMLFormElement>("#signupForm");
const nameInput = document.querySelector<HTMLInputElement>("#name");
const emailInput = document.querySelector<HTMLInputElement>("#email");
const messageEl = document.querySelector<HTMLDivElement>("#message");
const submitBtn = document.querySelector<HTMLButtonElement>("#submitBtn");

if (form && nameInput && emailInput && messageEl && submitBtn) {
  const supabaseClient =
    supabaseUrl && supabaseAnonKey
      ? createClient(supabaseUrl, supabaseAnonKey)
      : null;

  if (!supabaseClient) {
    submitBtn.disabled = true;
    messageEl.textContent = "Signup is not configured yet.";
    messageEl.className = "error";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing up...";
    messageEl.textContent = "";
    messageEl.className = "";

    const { error } = await supabaseClient.from("signups").insert([
      {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
      },
    ]);

    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Sign Up <span aria-hidden="true">↗</span>';

    if (error) {
      messageEl.textContent =
        error.code === "23505"
          ? "That email is already signed up."
          : "Something went wrong. Please try again.";
      messageEl.className = "error";
      return;
    }

    messageEl.textContent = "You're signed up! 🎉";
    messageEl.className = "success";
    form.reset();
  });
}