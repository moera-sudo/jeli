import { useNavigate } from 'react-router-dom'

import AuthLayout from '../../Components/AuthLayout/AuthLayout'
import TextField from '../../UI/TextField/TextField'
import Button from '../../UI/Button/Button'
import { UserIcon, MailIcon, LockIcon, ArrowRightIcon } from '../../UI/icons'
import { ROUTES } from '../../Routes/routes'
import styles from './AuthForm.module.css'

/**
 * Экран регистрации — только вёрстка.
 * Поля: имя, фамилия, отчество, электронная почта и пароль (с подтверждением).
 * Отправка просто перенаправляет на вход; реальная регистрация вне рамок задачи.
 */
export default function RegisterPage() {
  const navigate = useNavigate()

  const handleSubmit = (event) => {
    event.preventDefault()
    navigate(ROUTES.login)
  }

  return (
    <AuthLayout
      title="Регистрация"
      switchTo={{ hint: 'Уже есть аккаунт?', label: 'Войти', to: ROUTES.login }}
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.row}>
          <TextField
            label="Имя"
            name="firstName"
            placeholder="имя"
            autoComplete="given-name"
            icon={<UserIcon />}
          />
          <TextField
            label="Фамилия"
            name="surname"
            placeholder="фамилия"
            autoComplete="family-name"
            icon={<UserIcon />}
          />
        </div>

        <TextField
          label="Отчество"
          name="patronymic"
          placeholder="отчество"
          autoComplete="additional-name"
          icon={<UserIcon />}
        />

        <TextField
          label="Электронная почта"
          type="email"
          name="email"
          placeholder="адрес эл. почты"
          autoComplete="email"
          icon={<MailIcon />}
        />

        <div className={styles.row}>
          <TextField
            label="Пароль"
            type="password"
            name="password"
            placeholder="пароль"
            autoComplete="new-password"
            icon={<LockIcon />}
          />
          <TextField
            label="Подтверждение пароля"
            type="password"
            name="confirmPassword"
            placeholder="повторите пароль"
            autoComplete="new-password"
            icon={<LockIcon />}
          />
        </div>

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="accent"
            fullWidth
            trailingIcon={<ArrowRightIcon />}
          >
            Создать аккаунт
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
