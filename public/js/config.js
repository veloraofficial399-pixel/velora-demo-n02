/*
 * Site configuration.
 *
 * RSVPs and wishes are stored in Supabase (tables and access rules are in
 * supabase/schema.sql at the repository root). Paste your project's URL and
 * anon public key below — both are found in Supabase under
 * Project Settings → API. The anon key is safe to publish; row-level security
 * only lets guests add RSVPs, add wishes and read approved wishes.
 *
 * Until these are set, the site still works: responses are kept on the
 * guest's device and the RSVP confirmation offers a one-tap WhatsApp message
 * to the family, so no reply is lost.
 */
window.WEDDING_CONFIG = {
  supabase: {
    url: "",      // e.g. "https://abcdefghijkl.supabase.co"
    anonKey: "",  // the "anon" / "public" API key
    rsvpTable: "rsvps",
    wishesTable: "wishes"
  },

  // Reception: 13 February 2027, 7:00 PM India Standard Time (UTC+05:30)
  eventStart: "2027-02-13T19:00:00+05:30",

  // WhatsApp number used for the RSVP fallback (country code, no "+")
  whatsapp: "917025423395"
};
