import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignIn } from '#/components/SignIn'
import { isSignedIn } from '#/lib/session'

export const Route = createFileRoute('/sign-in')({
  beforeLoad: async () => {
    if (await isSignedIn()) throw redirect({ to: '/' })
  },
  component: SignIn,
})
