import { supabaseClient } from "./supabase";

type ReportTask = { title: string; minutes: number };

const reportForm = document.querySelector<HTMLFormElement>("#reportForm");
const reportDate = document.querySelector<HTMLInputElement>("#reportDate");
const taskList = document.querySelector<HTMLDivElement>("#taskList");
const addTaskButton =
  document.querySelector<HTMLButtonElement>("#addTaskButton");
const submitButton = document.querySelector<HTMLButtonElement>(
  "#reportSubmitButton",
);
const message = document.querySelector<HTMLDivElement>("#reportMessage");
const sessionEmail = document.querySelector<HTMLSpanElement>("#sessionEmail");
const signOutButton =
  document.querySelector<HTMLButtonElement>("#signOutButton");

if (
  reportForm &&
  reportDate &&
  taskList &&
  addTaskButton &&
  submitButton &&
  message &&
  sessionEmail &&
  signOutButton
) {
  if (!supabaseClient) {
    message.textContent = "Reporting is not configured yet.";
    message.className = "error";
  }

  const authenticatedClient = supabaseClient;

  reportDate.value = new Date().toISOString().slice(0, 10);

  const addTask = (task: ReportTask = { title: "", minutes: 30 }) => {
    if (taskList.children.length >= 5) return;

    const taskRow = document.createElement("div");
    taskRow.className = "task-row";
    taskRow.innerHTML = `
      <input class="task-title" type="text" placeholder="Key task" value="${escapeAttribute(task.title)}" aria-label="Task name" required />
      <input class="task-minutes" type="number" min="1" step="5" value="${task.minutes}" aria-label="Estimated minutes" required />
      <span class="minutes-label">min</span>
      <button class="remove-task" type="button" aria-label="Remove task">×</button>
    `;
    taskRow
      .querySelector<HTMLButtonElement>(".remove-task")
      ?.addEventListener("click", () => {
        taskRow.remove();
        syncTaskControls();
      });
    taskList.append(taskRow);
    syncTaskControls();
  };

  const syncTaskControls = () => {
    addTaskButton.disabled = taskList.children.length >= 5;
    addTaskButton.hidden = taskList.children.length >= 5;
  };

  addTask();
  addTask();
  addTask();
  addTaskButton.addEventListener("click", () => addTask());

  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const tasks = Array.from(
      taskList.querySelectorAll<HTMLDivElement>(".task-row"),
    ).map((row) => ({
      title:
        row.querySelector<HTMLInputElement>(".task-title")?.value.trim() ?? "",
      minutes: Number(
        row.querySelector<HTMLInputElement>(".task-minutes")?.value ?? 0,
      ),
    }));

    if (
      tasks.length < 3 ||
      tasks.some((task) => !task.title || task.minutes < 1)
    ) {
      message.textContent = "Add 3–5 tasks with an estimated time for each.";
      message.className = "error";
      return;
    }

    if (!authenticatedClient) {
      message.textContent = "Reporting is not configured yet.";
      message.className = "error";
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Saving report...";
    message.textContent = "";
    message.className = "";

    const { data: sessionData, error: sessionError } =
      await authenticatedClient.auth.getSession();
    if (sessionError || !sessionData.session?.user) {
      showError(
        "Sign in to save reports across devices.",
        submitButton,
        message,
      );
      return;
    }

    const { error } = await authenticatedClient
      .from("contribution_reports")
      .upsert(
        {
          user_id: sessionData.session.user.id,
          report_date: reportDate.value,
          north_star: getValue("northStar"),
          next_steps: tasks,
          morning_report: getValue("morningReport") || null,
          midday_report: getValue("middayReport") || null,
          final_report: getValue("finalReport") || null,
        },
        { onConflict: "user_id,report_date" },
      );

    if (error) {
      showError(
        "We couldn't save this report. Please try again.",
        submitButton,
        message,
      );
      return;
    }

    submitButton.disabled = false;
    submitButton.innerHTML = 'Report saved <span aria-hidden="true">✓</span>';
    message.textContent = "Today's contribution has been recorded.";
    message.className = "success";
  });

  authenticatedClient?.auth.getSession().then(({ data }) => {
    if (!data.session) {
      sessionEmail.textContent = "No account signed in";
      submitButton.disabled = true;
      message.textContent = "Sign in to save reports across devices.";
      message.className = "error";
      return;
    }
    sessionEmail.textContent = data.session.user.email ?? "Signed in";
  });

  signOutButton.addEventListener("click", async () => {
    if (!authenticatedClient) return;
    await authenticatedClient.auth.signOut();
    window.location.href = "/signup.html?mode=login";
  });
}

function showError(
  text: string,
  submitButton: HTMLButtonElement,
  message: HTMLDivElement,
) {
  submitButton.disabled = false;
  submitButton.innerHTML =
    'Save today\'s report <span aria-hidden="true">↗</span>';
  message.textContent = text;
  message.className = "error";
}

function getValue(id: string) {
  return (
    document
      .querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)
      ?.value.trim() ?? ""
  );
}

function escapeAttribute(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}
