// Shared mapping: DB tag values → user_preference_scores column names
// Imported by both useFeedbackInput and useSupabaseMenu to stay in sync.

export const FLAVOR_COL: Record<string, string> = {
  light:   'pref_light',
  spicy:   'pref_spicy',
  sweet:   'pref_sweet',
  salty:   'pref_salty',
  sour:    'pref_sour',
  seafood: 'pref_seafood',
  veggie:  'pref_veggie',
};

export const HEALTH_COL: Record<string, string> = {
  damp_clear:        'pref_damp_clear',
  muscle_gain:       'pref_muscle_gain',
  lose_weight:       'pref_lose_weight',
  maintain:          'pref_maintain',
  detox:             'pref_detox',
  authentic_hk:      'pref_authentic_hk',
  // Extensible — add new tags here, no DB schema change needed
  mood_boost:        'pref_mood_boost',
  anti_inflammation: 'pref_anti_inflammation',
  immunity:          'pref_immunity',
  beauty:            'pref_beauty',
  pregnancy:         'pref_pregnancy',
};

export const CUISINE_COL: Record<string, string> = {
  cantonese:       'pref_cantonese',
  sichuan:         'pref_sichuan',
  jiangnan:        'pref_jiangnan',
  northern:        'pref_northern',
  western:         'pref_western',
  japanese_korean: 'pref_japanese_korean',
  southeast_asian: 'pref_southeast_asian',
};
