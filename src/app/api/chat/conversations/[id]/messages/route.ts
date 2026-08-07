*** Begin Patch
*** Update File: src/app/api/chat/conversations/[id]/messages/route.ts
@@
-    const input = validateInput(sendMessageSchema, {
-      ...body,
-      conversationId,
-    });
-    // Keep a typed reference so we can satisfy the compiler in downstream
-    // places where TS infers `unknown` from the untyped validateInput call.
-    const validatedInput = input as SendMessageInput;
+    const input = validateInput(sendMessageSchema, {
+      ...body,
+      conversationId,
+    });
*** End Patch