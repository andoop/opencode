import { describe, expect, test } from "bun:test"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { User } from "../../src/user"
import { Log } from "../../src/util/log"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { Storage } from "../../src/storage/storage"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

function context(user: User.PublicInfo): User.UserContext {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    permission: user.permission,
  }
}

describe("project room", () => {
  test("creates a room thread and manages collaboration artifacts", async () => {
    await using dir = await tmpdir()
    await Instance.provide({
      directory: dir.path,
      fn: async () => {
        const suffix = Date.now().toString(36)
        const owner = await User.create({
          username: `owner-${suffix}`,
          password: "password",
          role: "admin",
        })
        const qa = await User.create({
          username: `qa-${suffix}`,
          password: "password",
          role: "user",
        })

        const room = await User.provide(context(owner), () =>
          Session.createRoomThread({
            title: "Checkout revamp",
            agent_auto_join: false,
            participants: [
              {
                userID: qa.id,
                projectRole: "qa",
                title: "QA",
              },
            ],
          }),
        )

        expect(room.kind).toBe("room_thread")
        expect(room.room?.title).toBe("Checkout revamp")
        expect(room.room?.agent_auto_join).toBe(false)
        expect(room.room?.participants.map((item) => item.userID)).toContain(owner.id)
        expect(room.room?.participants.map((item) => item.userID)).toContain(qa.id)

        const inbox = await User.provide(context(qa), () => Session.roomInbox({}))
        expect(inbox.map((item) => item.session.id)).toContain(room.id)
        expect(inbox.find((item) => item.session.id === room.id)?.participant?.projectRole).toBe("qa")

        const opened = await User.provide(context(qa), () => Session.openRoom(room.id))
        expect(opened.session.id).toBe(room.id)
        expect(opened.directory).toBe(room.directory)

        const roleChanged = await User.provide(context(owner), () =>
          Session.updateParticipant({
            sessionID: room.id,
            userID: qa.id,
            updates: {
              projectRole: "dev",
            },
          }),
        )
        expect(roleChanged.room?.participants.find((item) => item.userID === qa.id)?.projectRole).toBe("dev")

        const updated = await User.provide(context(owner), () =>
          Session.addDecision({
            sessionID: room.id,
            decision: {
              text: "Ship a staged checkout revamp with QA signoff.",
            },
          }),
        )
        expect(updated.decisions?.[0]?.text).toContain("checkout")

        const messageID = Identifier.ascending("message")
        await Storage.write(["message", room.id, messageID], {
          id: messageID,
          role: "user",
          sessionID: room.id,
          time: { created: Date.now() },
          agent: room.room!.agent,
          model: { providerID: "test", modelID: "test" },
          authorUserID: owner.id,
          authorUsername: owner.username,
          authorProjectRole: "pm",
        } satisfies MessageV2.User)
        const partID = Identifier.ascending("part")
        await Storage.write(["part", messageID, partID], {
          id: partID,
          sessionID: room.id,
          messageID,
          type: "mention",
          targetType: "role",
          label: "qa",
        } satisfies MessageV2.MentionPart)

        const stored = await MessageV2.get({ sessionID: room.id, messageID })
        expect(stored.parts).toContainEqual(expect.objectContaining({ label: "qa", targetType: "role" }))

        const execution = await User.provide(context(owner), () =>
          Session.createExecution({
            sessionID: room.id,
            title: "Implement checkout revamp",
          }),
        )
        expect(execution.kind).toBe("execution")
        expect(execution.parentID).toBe(room.id)
        expect(execution.room?.stage).toBe("execution")
      },
    })
  }, 60000)
})
