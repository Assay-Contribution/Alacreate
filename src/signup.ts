import "./styles.css";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseClient =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const authForm = document.querySelector<HTMLFormElement>("#authForm");
const emailInput = document.querySelector<HTMLInputElement>("#email");
const passwordInput = document.querySelector<HTMLInputElement>("#password");
const authTitle = document.querySelector<HTMLHeadingElement>("#authTitle");
const authSubtitle =
  document.querySelector<HTMLParagraphElement>("#authSubtitle");
const submitButton =
  document.querySelector<HTMLButtonElement>("#authSubmitButton");
const switchButton =
  document.querySelector<HTMLButtonElement>("#authSwitchButton");
const message = document.querySelector<HTMLDivElement>("#authMessage");

let isSignInMode =
  new URLSearchParams(window.location.search).get("mode") === "login";

if (
  authForm &&
  emailInput &&
  passwordInput &&
  authTitle &&
  authSubtitle &&
  submitButton &&
  switchButton &&
  message
) {
  if (isSignInMode) {
    authTitle.textContent = "Welcome back";
    authSubtitle.textContent = "Sign in to access your contribution reports.";
    submitButton.innerHTML = 'Sign in <span aria-hidden="true">↗</span>';
    switchButton.textContent = "Need an account? Create one";
  }

  if (!supabaseClient) {
    submitButton.disabled = true;
    switchButton.disabled = true;
    message.textContent = "Authentication is not configured yet.";
    message.className = "error";
  }

  switchButton.addEventListener("click", () => {
    isSignInMode = !isSignInMode;
    authTitle.textContent = isSignInMode
      ? "Welcome back"
      : "Create your account";
    authSubtitle.textContent = isSignInMode
      ? "Sign in to access your contribution reports."
      : "Use your email and a password to get started.";
    submitButton.innerHTML = isSignInMode
      ? 'Sign in <span aria-hidden="true">↗</span>'
      : 'Create account <span aria-hidden="true">↗</span>';
    switchButton.textContent = isSignInMode
      ? "Need an account? Create one"
      : "Already have an account? Sign in";
    message.textContent = "";
    message.className = "";
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseClient) return;

    submitButton.disabled = true;
    switchButton.disabled = true;
    submitButton.textContent = isSignInMode
      ? "Signing in..."
      : "Creating account...";
    message.textContent = "";
    message.className = "";

    const result = isSignInMode
      ? await supabaseClient.auth.signInWithPassword({
          email: emailInput.value.trim(),
          password: passwordInput.value,
        })
      : await supabaseClient.auth.signUp({
          email: emailInput.value.trim(),
          password: passwordInput.value,
        });

    submitButton.disabled = false;
    switchButton.disabled = false;
    submitButton.innerHTML = isSignInMode
      ? 'Sign in <span aria-hidden="true">↗</span>'
      : 'Create account <span aria-hidden="true">↗</span>';

    if (result.error) {
      message.textContent = result.error.message;
      message.className = "error";
      return;
    }

    if (isSignInMode) {
      window.location.href = "/reporting.html";
      return;
    }

    message.textContent = result.data.session
      ? "Your account is ready. Redirecting to reporting..."
      : "Account created. Check your email to confirm your account before signing in.";
    message.className = "success";
    if (result.data.session) window.location.href = "/reporting.html";
  });
}
