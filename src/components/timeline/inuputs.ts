/*
    This should have something where the user can add items such as links, files, and a descriotion.
    The interface should be intuitive and very simple to use.

*/

export type ComposerSubmission = {
  text: string;
  links: string[];
  files: File[];
};

export type ComposerOptions = {
  container: HTMLElement;
  onSubmit: (submission: ComposerSubmission) => Promise<void> | void;
};

export function renderComposer(options: ComposerOptions): void {
  const { container, onSubmit } = options;

  container.innerHTML = "";
  container.classList.add("composer");

  const pendingLinks: string[] = [];
  const pendingFiles: File[] = [];

  const chipRow = document.createElement("div");
  chipRow.className = "composer-chips";
  chipRow.hidden = true;

  const renderChips = () => {
    chipRow.innerHTML = "";
    pendingLinks.forEach((url, index) => {
      chipRow.append(
        createChip(url, () => {
          pendingLinks.splice(index, 1);
          renderChips();
        }),
      );
    });
    pendingFiles.forEach((file, index) => {
      chipRow.append(
        createChip(file.name, () => {
          pendingFiles.splice(index, 1);
          renderChips();
        }),
      );
    });
    chipRow.hidden = pendingLinks.length === 0 && pendingFiles.length === 0;
  };

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.className = "composer-text";
  textInput.placeholder = "Add a quick note...";
  textInput.setAttribute("aria-label", "Note");

  const linkButton = iconButton("🔗", "Add a link");
  const fileButton = iconButton("📎", "Attach a file");

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.addEventListener("change", () => {
    Array.from(fileInput.files ?? []).forEach((file) => pendingFiles.push(file));
    fileInput.value = "";
    renderChips();
  });
  fileButton.addEventListener("click", () => fileInput.click());

  linkButton.addEventListener("click", () => {
    const url = window.prompt("Paste a link");
    if (!url) return;
    try {
      new URL(url);
    } catch {
      window.alert("That doesn't look like a valid link.");
      return;
    }
    pendingLinks.push(url);
    renderChips();
  });

  const submitButton = document.createElement("button");
  submitButton.type = "button";
  submitButton.className = "composer-submit";
  submitButton.textContent = "Add";

  submitButton.addEventListener("click", async () => {
    const text = textInput.value.trim();
    if (!text && pendingLinks.length === 0 && pendingFiles.length === 0) return;

    submitButton.disabled = true;
    await onSubmit({ text, links: [...pendingLinks], files: [...pendingFiles] });
    submitButton.disabled = false;

    textInput.value = "";
    pendingLinks.length = 0;
    pendingFiles.length = 0;
    renderChips();
  });

  textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitButton.click();
    }
  });

  const row = document.createElement("div");
  row.className = "composer-row";
  row.append(textInput, linkButton, fileButton, fileInput, submitButton);

  container.append(chipRow, row);
  renderChips();

  let dragDepth = 0;
  container.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dragDepth++;
    container.classList.add("is-dragover");
  });
  container.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
  });
  container.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) container.classList.remove("is-dragover");
  });
  container.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    container.classList.remove("is-dragover");
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (dropped.length === 0) return;
    dropped.forEach((file) => pendingFiles.push(file));
    renderChips();
  });
}

function iconButton(icon: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "composer-icon-button";
  button.setAttribute("aria-label", label);
  button.innerHTML = `<span aria-hidden="true">${icon}</span>`;
  return button;
}

function createChip(label: string, onRemove: () => void): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = "composer-chip";
  chip.textContent = label;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${label}`);
  remove.textContent = "×";
  remove.addEventListener("click", onRemove);

  chip.append(remove);
  return chip;
}
