import { supabaseClient } from "./supabase";

const signupForm = document.querySelector<HTMLFormElement>("#signupForm");
const nameInput = document.querySelector<HTMLInputElement>("#name");
const emailInput = document.querySelector<HTMLInputElement>("#email");
const submitButton = document.querySelector<HTMLButtonElement>("#submitBtn");
const message = document.querySelector<HTMLDivElement>("#message");

if (signupForm && nameInput && emailInput && submitButton && message) {
	signupForm.addEventListener("submit", async (event) => {
		event.preventDefault();

		if (!supabaseClient) {
			message.textContent = "Signup is not available right now.";
			message.className = "error";
			return;
		}

		submitButton.disabled = true;
		submitButton.textContent = "Joining...";
		message.textContent = "";
		message.className = "";

		const { error } = await supabaseClient.from("signups").insert({
			name: nameInput.value.trim(),
			email: emailInput.value.trim().toLowerCase(),
		});

		submitButton.disabled = false;
		submitButton.innerHTML = 'Sign Up <span aria-hidden="true">↗</span>';

		if (error) {
			message.textContent =
				error.code === "23505"
					? "That email is already on the list."
					: "We couldn't complete your signup. Please try again.";
			message.className = "error";
			return;
		}

		signupForm.reset();
		message.textContent = "You're on the list. Thank you for contributing.";
		message.className = "success";
	});
}
