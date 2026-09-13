import { RailblockApp } from '@/components/railblock-app'
import { AuthProvider } from '@/lib/auth'
import { RolesProvider } from '@/lib/roles'

export default function Page() {
  return (
    <AuthProvider>
      <RolesProvider>
        <RailblockApp />
      </RolesProvider>
    </AuthProvider>
  )
}
