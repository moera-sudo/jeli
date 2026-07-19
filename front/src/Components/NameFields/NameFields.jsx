import TextField from '../../UI/TextField/TextField'
import { UserIcon } from '../../UI/icons'
import styles from './NameFields.module.css'

/**
 * Three name inputs in the CIS order: Фамилия · Имя · Отчество
 * (surname · first name · middle name). Presentational only — the caller owns
 * the state and recombines the parts into a single `full_name` when saving.
 */
const PARTS = [
  { key: 'surname', label: 'Фамилия', placeholder: 'Серіков', autoComplete: 'family-name' },
  { key: 'firstName', label: 'Имя', placeholder: 'Бекнұр', autoComplete: 'given-name' },
  { key: 'middleName', label: 'Отчество', placeholder: 'Асанұлы', autoComplete: 'additional-name' },
]

/**
 * @param {object} props
 * @param {{ surname?: string, firstName?: string, middleName?: string }} props.values
 * @param {(field: string, value: string) => void} props.onChange
 * @param {'stack'|'grid'} [props.layout]      stack → one column; grid → three across.
 * @param {boolean} [props.withIcons]          Show a leading user icon on each field.
 * @param {string[]} [props.requiredParts]     Parts marked required (label asterisk).
 */
export default function NameFields({
  values,
  onChange,
  layout = 'stack',
  withIcons = false,
  requiredParts = [],
}) {
  const requiredSet = new Set(requiredParts)

  return (
    <div className={layout === 'grid' ? styles.grid : styles.stack}>
      {PARTS.map(({ key, label, placeholder, autoComplete }) => (
        <TextField
          key={key}
          label={label}
          name={key}
          placeholder={placeholder}
          autoComplete={autoComplete}
          icon={withIcons ? <UserIcon /> : undefined}
          required={requiredSet.has(key)}
          value={values[key] ?? ''}
          onChange={(e) => onChange(key, e.target.value)}
        />
      ))}
    </div>
  )
}
