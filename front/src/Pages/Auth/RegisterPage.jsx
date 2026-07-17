import { useNavigate } from 'react-router-dom'

import AuthLayout from '../../Components/AuthLayout/AuthLayout'
import TextField from '../../UI/TextField/TextField'
import Button from '../../UI/Button/Button'
import { MailIcon, LockIcon, ArrowRightIcon } from '../../UI/icons'
import { ROUTES } from '../../Routes/routes'
import styles from './AuthForm.module.css'

export default function RegisterPage() {
  const navigate = useNavigate()

  const handleSubmit = (event) => {
    event.preventDefault()
    navigate(ROUTES.login)
  }

  return (
    <AuthLayout
      title="Регистрация"
      subtitle="Создайте аккаунт, чтобы начать строить своё древо."
      switchTo={{ hint: 'Уже есть аккаунт?', label: 'Войти', to: ROUTES.login }}
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
          autoComplete="new-password"
          icon={<LockIcon />}
        />

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
