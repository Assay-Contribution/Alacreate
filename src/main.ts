import "./styles.css";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
const form = document.querySelector<HTMLFormElement>("#signupForm");
const nameInput = document.querySelector<HTMLInputElement>("#name");
const emailInput = document.querySelector<HTMLInputElement>("#email");
const messageEl = document.querySelector<HTMLDivElement>("#message");
const submitBtn = document.querySelector<HTMLButtonElement>("#submitBtn");

if (!form || !nameInput || !emailInput || !messageEl || !submitBtn) {
  throw new Error("Signup form markup is incomplete.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

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
  submitBtn.textContent = "Sign Up";

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
