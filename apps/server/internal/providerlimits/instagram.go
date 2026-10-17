package providerlimits

// InstagramLoginSettingUnavailable describes direct-login restrictions shared
// by capability admission and delivery. Shopping tags are unavailable, and
// OpenPost's location picker requires Facebook Page search permissions.
// Verified 2026-10-17 against Meta's Content Publishing guide:
// https://developers.facebook.com/documentation/instagram-platform/content-publishing
func InstagramLoginSettingUnavailable(key string) bool {
	switch key {
	case "location_id", "product_tags":
		return true
	default:
		return false
	}
}
