import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import AuthLayout from '../../Components/AuthLayout/AuthLayout'
import TextField from '../../UI/TextField/TextField'
import Button from '../../UI/Button/Button'
import { MailIcon, LockIcon, ArrowRightIcon } from '../../UI/icons'
import { ROUTES } from '../../Routes/Routes'
import { useAuth } from '../../utils/AuthContext'
import { isValidEmail } from '../../utils/validation'
import styles from './AuthForm.module.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Email is validated live once the field has content.
  const emailInvalid = email.length > 0 && !isValidEmail(email)
  const canSubmit = isValidEmail(email) && password.length > 0 && !submitting

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return

    setFormError('')
    setSubmitting(true)
    try {
      await login({ email: email.trim(), password })
      navigate(ROUTES.home, { replace: true })
    } catch (err) {
      setFormError(err.message || 'Не удалось войти')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Вход"
      subtitle="Войдите, чтобы продолжить работу с родословной."
      switchTo={{ hint: 'Нет аккаунта?', label: 'Зарегистрироваться', to: ROUTES.register }}
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <TextField
          label="Электронная почта"
          type="email"
          name="email"
          placeholder="адрес эл. почты"
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
          autoComplete="current-password"
          icon={<LockIcon />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {formError && (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        )}

        <div className={styles.actions}>
          <Button
            type="submit"
            fullWidth
            trailingIcon={<ArrowRightIcon />}
            disabled={!canSubmit}
          >
            {submitting ? 'Вход…' : 'Войти'}
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
