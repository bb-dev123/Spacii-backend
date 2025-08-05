import jwt from 'jsonwebtoken';

interface UserPayload {
  id: string;
}

export const getToken = (user: UserPayload): string => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables.');
  }

  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: '60d',
  });
};
