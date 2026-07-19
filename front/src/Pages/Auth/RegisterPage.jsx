import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import AuthLayout from '../../Components/AuthLayout/AuthLayout'
import TextField from '../../UI/TextField/TextField'
import Button from '../../UI/Button/Button'
import { MailIcon, LockIcon, UserIcon, UsersIcon, ArrowRightIcon } from '../../UI/icons'
import { ROUTES } from '../../Routes/Routes'
import { useAuth } from '../../auth/AuthContext'
import { isValidEmail, isValidPassword, isValidFamilyCode } from '../../utils/validation'
import { joinFullName } from '../../utils/fullName'
import styles from './AuthForm.module.css'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()

  // Name in the CIS order: surname · first name · middle name (отчество optional).
  const [surname, setSurname] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [hasFamily, setHasFamily] = useState(false)
  const [familyCode, setFamilyCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Live, per-field validation — messages appear only once a field has content.
  const emailInvalid = email.length > 0 && !isValidEmail(email)
  const passwordInvalid = password.length > 0 && !isValidPassword(password)
  const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== password
  const codeInvalid = hasFamily && familyCode.length > 0 && !isValidFamilyCode(familyCode)

  // Surname and first name are mandatory; middle name (отчество) is optional.
  const nameValid = surname.trim().length > 0 && firstName.trim().length > 0

  const canSubmit =
    nameValid &&
    isValidEmail(email) &&
    isValidPassword(password) &&
    confirmPassword === password &&
    (!hasFamily || isValidFamilyCode(familyCode)) &&
    !submitting

  // Digits-only, capped at 6 characters, for the invite code field.
  const handleCodeChange = (event) =>
    setFamilyCode(event.target.value.replace(/\D/g, '').slice(0, 6))

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return

    setFormError('')
    setSubmitting(true)
    try {
      await register({
        full_name: joinFullName({ surname, firstName, middleName }),
        email: email.trim(),
        password,
        // No code → first family member (assigned the family-admin role).
        graph_invite_code: hasFamily ? familyCode : null,
      })
      // Fresh account → complete the empty profile before entering the app.
      navigate(ROUTES.onboarding, { replace: true })
    } catch (err) {
      setFormError(err.message || 'Не удалось зарегистрироваться')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Регистрация"
      subtitle="Создайте аккаунт, чтобы начать строить своё древо."
      switchTo={{ hint: 'Уже есть аккаунт?', label: 'Войти', to: ROUTES.login }}
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <TextField
          label="Фамилия"
          type="text"
          name="surname"
          placeholder="Серіков"
          autoComplete="family-name"
          icon={<UserIcon />}
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
        />

        <TextField
          label="Имя"
          type="text"
          name="first_name"
          placeholder="Бекнұр"
          autoComplete="given-name"
          icon={<UserIcon />}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />

        <TextField
          label="Отчество"
          type="text"
          name="middle_name"
          placeholder="Асанұлы (необязательно)"
          autoComplete="additional-name"
          icon={<UserIcon />}
          value={middleName}
          onChange={(e) => setMiddleName(e.target.value)}
        />

        <TextField
          label="Электронная почта"
          type="email"
          name="email"
          placeholder="адрес e-mail"
          autoComplete="email"
          icon={<MailIcon />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailInvalid ? 'Введите корректный адрес эл. почты' : undefined}
        />

        <TextField
          label="Пароль"
          type="password"
          name="password"
          placeholder="пароль"
          autoComplete="new-password"
          icon={<LockIcon />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordInvalid ? 'Минимум 8 символов' : undefined}
        />

        <TextField
          label="Повторите пароль"
          type="password"
          name="confirmPassword"
          placeholder="повторите пароль"
          autoComplete="new-password"
          icon={<LockIcon />}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={passwordsMismatch ? 'Пароли не совпадают' : undefined}
        />

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={hasFamily}
            onChange={(e) => {
              setHasFamily(e.target.checked)
              if (!e.target.checked) setFamilyCode('')
            }}
          />
          <span className={styles.checkboxLabel}>У вас уже есть семья на платформе?</span>
        </label>

        {hasFamily && (
          <TextField
            label="Код приглашения"
            type="text"
            name="familyCode"
            placeholder="6-значный код"
            inputMode="numeric"
            icon={<UsersIcon />}
            value={familyCode}
            onChange={handleCodeChange}
            error={codeInvalid ? 'Код состоит из 6 цифр' : undefined}
          />
        )}

        {formError && (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        )}

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="accent"
            fullWidth
            trailingIcon={<ArrowRightIcon />}
            disabled={!canSubmit}
          >
            {submitting ? 'Создание…' : 'Создать аккаунт'}
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
