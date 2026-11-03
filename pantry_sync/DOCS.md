# Set up Pantry Sync

1. In [Pantry](https://pantry-inventory-app-493a5.web.app), open **Settings → Home Assistant Sync** and copy your household ID.
2. Create a dedicated Pantry account, verify its email, and invite it to that household. Accept the invitation with the connector account. Enter that account’s email and password directly in the Home Assistant app’s **Configuration** tab.
3. Set `household_id` to the ID copied from Pantry and `list_entity` to the exact Home Assistant to-do entity, such as `todo.shopping_list`. Verify the entity under **Settings → Devices & services → Entities**.
4. Leave `sync_enabled` off and start the app. Check **Log** for the preview, which reports the number of shared items and changes without writing to either list.
5. If the preview matches the list you intended to connect, turn `sync_enabled` on and start the app again. Once checked, enable **Start on boot**.

## Check two-way sync

Add a temporary item in Pantry and confirm that it appears in Home Assistant. Rename and complete it in Home Assistant, then confirm the changes in Pantry. Reopen and remove it from Pantry to check the return direction. Allow up to a polling cycle between actions. A bought item only becomes inventory when you restock it in Pantry.

On the first run, active items merge. Existing unrelated completed Home Assistant entries are left alone. Duplicate names can pause sync. Check **Log** if the lists differ. Stop the app to pause sync.

## Optional Pantry push reminders

Leave `notifications_enabled` off for a shopping-only connector. Initial reminder provisioning requires the Pantry household owner’s account. After enabling the sender, each person can set up notifications from **My profile. → Notifications** on their own device. Keep the app’s persistent data in Home Assistant backups, which includes sync mappings and, if enabled, push signing keys.

## Access

Home Assistant provides this app with Core API access. The connector uses it to read and update the selected to-do list. A dedicated Pantry account limits its Pantry access to the households it has joined. Keep the app’s configuration and backup private. If replacing an existing installation, stop the old connector before starting a second one against the same lists, and keep its backup for recovery.
