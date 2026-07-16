import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const hasEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const rulesSuite = hasEmulators ? describe : describe.skip;

rulesSuite("Storage security rules", () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: "orbit-pm-79c3b",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
      storage: { rules: readFileSync("storage.rules", "utf8") },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.clearStorage();
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "workspaces", "w1"), { workspaceName: "Test", ownerId: "owner" });
      await setDoc(doc(db, "workspaces", "w1", "members", "member"), { id: "member", role: "Member" });
      await setDoc(doc(db, "workspaces", "w1", "members", "viewer"), { id: "viewer", role: "Viewer" });
    });
  });

  afterAll(async () => environment?.cleanup());

  it("allows editors to upload and read task attachments", async () => {
    const storage = environment.authenticatedContext("member").storage();
    const attachment = ref(storage, "workspaces/w1/tasks/t1/a1/brief.txt");
    await assertSucceeds(uploadBytes(attachment, new TextEncoder().encode("launch brief"), { contentType: "text/plain" }));
    await assertSucceeds(getBytes(attachment));
  });

  it("blocks viewer uploads and outsider downloads", async () => {
    const memberStorage = environment.authenticatedContext("member").storage();
    const viewerStorage = environment.authenticatedContext("viewer").storage();
    const outsiderStorage = environment.authenticatedContext("outsider").storage();
    const path = "workspaces/w1/tasks/t1/a1/private.txt";
    await assertSucceeds(uploadBytes(ref(memberStorage, path), new TextEncoder().encode("private")));
    await assertFails(uploadBytes(ref(viewerStorage, "workspaces/w1/tasks/t1/a2/no.txt"), new TextEncoder().encode("blocked")));
    await assertFails(getBytes(ref(outsiderStorage, path)));
  });
});
