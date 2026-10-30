import { setSuggestionPlacement, useSuggestionPlacement, type SuggestionPlacement } from '../../data/preferences'
import { Group, RadioList } from './parts'

const PLACEMENTS: { id: SuggestionPlacement; label: string; detail: string }[] = [
  { id: 'input', label: 'Above the input bar', detail: 'A swipeable row of your regulars, right where you type.' },
  { id: 'home', label: 'On the Home screen', detail: 'A section on Home, under your summary.' },
  { id: 'off', label: 'Off', detail: 'No suggestions anywhere, including the add form.' },
]

export function SuggestionsSection() {
  const placement = useSuggestionPlacement()
  return (
    <Group id="suggest-h" title="Suggestions">
      <RadioList
        name="suggestion-placement"
        label="Where to show suggestions"
        value={placement}
        options={PLACEMENTS}
        onChange={(p) => void setSuggestionPlacement(p)}
      />
    </Group>
  )
}
