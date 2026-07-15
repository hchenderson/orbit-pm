import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const rulesSuite = hasEmulator ? describe : describe.skip;

rulesSuite("Firestore security rules", () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: "orbit-pm-rules-test",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "workspaces", "w1"), { workspaceName: "Test", ownerId: "owner" });
      await setDoc(doc(db, "workspaces", "w1", "members", "owner"), { id: "owner", role: "Owner" });
      await setDoc(doc(db, "workspaces", "w1", "members", "member"), { id: "member", role: "Member" });
      await setDoc(doc(db, "workspaces", "w1", "members", "viewer"), { id: "viewer", role: "Viewer" });
      await setDoc(doc(db, "workspaces", "w1", "projects", "p1"), { id: "p1", name: "Launch" });
      await setDoc(doc(db, "workspaces", "w1", "invitations", "invite1"), { id: "invite1", email: "new@example.com", role: "Member", status: "pending" });
    });
  });

  afterAll(async () => environment?.cleanup());

  it("allows members to read their workspace and blocks outsiders", async () => {
    const memberDb = environment.authenticatedContext("member").firestore();
    const outsiderDb = environment.authenticatedContext("outsider").firestore();
    await assertSucceeds(getDoc(doc(memberDb, "workspaces", "w1")));
    await assertFails(getDoc(doc(outsiderDb, "workspaces", "w1")));
  });

  it("allows members to create tasks but blocks viewers", async () => {
    const task = { id: "t1", projectId: "p1", title: "Secure the launch" };
    const memberDb = environment.authenticatedContext("member").firestore();
    const viewerDb = environment.authenticatedContext("viewer").firestore();
    await assertSucceeds(setDoc(doc(memberDb, "workspaces", "w1", "tasks", "t1"), task));
    await assertFails(setDoc(doc(viewerDb, "workspaces", "w1", "tasks", "t2"), { ...task, id: "t2" }));
  });

  it("prevents members from changing workspace ownership", async () => {
    const memberDb = environment.authenticatedContext("member").firestore();
    await assertFails(setDoc(doc(memberDb, "workspaces", "w1"), { workspaceName: "Taken", ownerId: "member" }));
    expect(true).toBe(true);
  });

  it("allows only the addressed invitee to accept an invitation", async () => {
    const inviteeDb = environment.authenticatedContext("new-user", { email: "new@example.com" }).firestore();
    const wrongDb = environment.authenticatedContext("wrong-user", { email: "wrong@example.com" }).firestore();
    await assertSucceeds(getDoc(doc(inviteeDb, "workspaces", "w1", "invitations", "invite1")));
    await assertFails(getDoc(doc(wrongDb, "workspaces", "w1", "invitations", "invite1")));
  });
});
