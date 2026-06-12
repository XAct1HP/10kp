# Mux Webhook to Gallery Manual Test

## Required Supabase fields

The `public.pitches` table must include:

- `id uuid`
- `file_type text`
- `mux_upload_id text`
- `mux_asset_id text`
- `mux_playback_id text`
- `mux_status text`
- `mux_error text`

## Environment checklist

- `MUX_TOKEN_ID`
- `MUX_TOKEN_SECRET`
- `MUX_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

## End-to-end verification

1. Start the app and webhook forwarding.

```bash
npm run dev
mux webhooks listen --forward-to http://localhost:3000/api/webhooks/mux
```

2. Submit a video pitch from `/intake`.

3. In Supabase, confirm the new `pitches` row exists with:

- `file_type = 'video'`
- `mux_status = 'uploading'` after `/api/mux/create-upload`
- `mux_upload_id` populated

4. Wait for the browser upload to finish, then confirm the same row moves to:

- `mux_status = 'processing'`
- `mux_error is null`

5. In the Mux dashboard, confirm the uploaded asset reaches ready state.

6. Watch the local server logs for webhook events. You should see:

- `video.upload.asset_created`
- `video.asset.ready`
- the event type
- `uploadId`
- `assetId`
- `playbackId`
- `matchedPitchId`

7. In Supabase, confirm `video.upload.asset_created` updated:

- `mux_asset_id`
- `mux_status = 'processing'` unless the row is already playable

8. In Supabase, confirm `video.asset.ready` updated:

- `mux_asset_id`
- `mux_playback_id`
- `mux_status = 'ready'`
- `mux_error is null`

9. Open `/gallery` and confirm the submission renders a Mux player.

10. Press play and confirm the video streams successfully.

11. Replay any older errored webhook after the ready event and confirm:

- the row keeps its `mux_playback_id`
- `mux_status` does not get forced back to `errored`
- the gallery still plays the video

12. If `video.asset.ready` arrives without a playback ID, confirm the server log shows the fallback playback ID creation attempt. After success, verify `mux_playback_id` is stored.
