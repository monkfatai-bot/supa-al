export interface AuthActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface ChangeEmailInput {
  newEmail: string;
  password: string;
}
