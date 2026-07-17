import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import AuthLayout from '../../Components/AuthLayout/AuthLayout'
import TextField from '../../UI/TextField/TextField'
import Button from '../../UI/Button/Button'
import { MailIcon, LockIcon, ArrowRightIcon } from '../../UI/icons'
import { ROUTES } from '../../Routes/routes'
import { isValidEmail } from '../../utils/validation'
import styles from './AuthForm.module.css'

export default function LoginPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Email is validated live once the field has content.
  const emailInvalid = email.length > 0 && !isValidEmail(email)

  const handleSubmit = (event) => {
    event.preventDefault()
    if (emailInvalid) return
    navigate(ROUTES.home)
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

        <div className={styles.actions}>
          <Button
            type="submit"
            fullWidth
            trailingIcon={<ArrowRightIcon />}
            disabled={emailInvalid}
          >
            Войти
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
