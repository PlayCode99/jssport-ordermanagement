import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInitials } from '@/hooks/use-initials';
import type { Team, User } from '@/types';

export function UserInfo({
    user,
    showEmployeeCode = false,
    team = null,
}: {
    user: User;
    /** The staff code, shown in place of the generated login address. */
    showEmployeeCode?: boolean;
    team?: Team | null;
}) {
    const getInitials = useInitials();
    const showAvatar = Boolean(user.avatar && user.avatar !== '');

    return (
        <>
            <Avatar className="h-8 w-8 overflow-hidden rounded-lg">
                {showAvatar ? (
                    <AvatarImage src={user.avatar} alt={user.name} />
                ) : null}
                <AvatarFallback className="rounded-lg text-black dark:text-white">
                    {getInitials(user.name)}
                </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                {team ? (
                    <span className="truncate text-xs text-muted-foreground">
                        {team.name}
                    </span>
                ) : null}
                {!team && showEmployeeCode && user.employee_code ? (
                    <span className="truncate text-xs text-muted-foreground">
                        {user.employee_code}
                    </span>
                ) : null}
            </div>
        </>
    );
}
