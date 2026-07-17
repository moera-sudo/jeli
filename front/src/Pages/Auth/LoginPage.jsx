import { useNavigate } from 'react-router-dom'

import AuthLayout from '../../Components/AuthLayout/AuthLayout'
import TextField from '../../UI/TextField/TextField'
import Button from '../../UI/Button/Button'
import { MailIcon, LockIcon, ArrowRightIcon } from '../../UI/icons'
import { ROUTES } from '../../Routes/routes'
import styles from './AuthForm.module.css'

/**
 * Экран авторизации — только вёрстка.
 * Отправка просто перенаправляет на главную; реальная аутентификация вне рамок задачи.
 */
export default function LoginPage() {
  const navigate = useNavigate()

  const handleSubmit = (event) => {
    event.preventDefault()
    navigate(ROUTES.home)
  }

  return (
    <AuthLayout
      title="Вход"
      switchTo={{ hint: 'Нет аккаунта?', label: 'Зарегистрироваться', to: ROUTES.register }}
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <TextField
          label="Электронная почта"
          type="email"
          name="email"
          placeholder="адрес эл. почты"
          autoComplete="email"
          icon={<MailIcon />}
        />
        <TextField
          label="Пароль"
          type="password"
          name="password"
          placeholder="пароль"
          autoComplete="current-password"
          icon={<LockIcon />}
        />

        <div className={styles.actions}>
          <Button type="submit" fullWidth trailingIcon={<ArrowRightIcon />}>
            Войти
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
