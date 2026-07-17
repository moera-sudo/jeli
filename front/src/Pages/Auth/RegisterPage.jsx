import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import AuthLayout from '../../Components/AuthLayout/AuthLayout'
import TextField from '../../UI/TextField/TextField'
import Button from '../../UI/Button/Button'
import { MailIcon, LockIcon, ArrowRightIcon } from '../../UI/icons'
import { ROUTES } from '../../Routes/routes'
import { isValidEmail } from '../../utils/validation'
import styles from './AuthForm.module.css'

export default function RegisterPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Email is validated live once the field has content.
  const emailInvalid = email.length > 0 && !isValidEmail(email)

  // Passwords are compared live: the message appears as soon as the confirm
  // field has content and the two values differ.
  const passwordsMismatch =
    confirmPassword.length > 0 && confirmPassword !== password

  const handleSubmit = (event) => {
    event.preventDefault()
    if (emailInvalid || passwordsMismatch) return
    navigate(ROUTES.login)
  }

  return (
    <AuthLayout
      title="Регистрация"
      subtitle="Создайте аккаунт, чтобы начать строить своё древо."
      switchTo={{ hint: 'Уже есть аккаунт?', label: 'Войти', to: ROUTES.login }}
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
          autoComplete="new-password"
          icon={<LockIcon />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="accent"
            fullWidth
            trailingIcon={<ArrowRightIcon />}
            disabled={emailInvalid || passwordsMismatch}
          >
            Создать аккаунт
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
