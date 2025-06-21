import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database';
import { config } from '../config';
import logger from '../../utils/logger';

/**
 * User payload in JWT token
 */
export interface JWTPayload {
  userId: string;
  email: string;
}

/**
 * Extended Request with user information
 */
export interface AuthRequest extends Request {
  user?: JWTPayload;
}

/**
 * Authentication service
 */
export class AuthService {
  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  static generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
    });
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token: string): JWTPayload {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
  }

  /**
   * Create user session
   */
  static async createSession(userId: string): Promise<string> {
    const token = this.generateToken({ userId, email: '' }); // Email will be fetched when needed
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.session.create({
      data: {
        userId,
        token,
        expiresAt
      }
    });

    return token;
  }

  /**
   * Validate session
   */
  static async validateSession(token: string): Promise<JWTPayload | null> {
    try {
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true }
      });

      if (!session || session.expiresAt < new Date()) {
        return null;
      }

      return {
        userId: session.user.id,
        email: session.user.email
      };
    } catch (error) {
      logger.error('Session validation error', error);
      return null;
    }
  }

  /**
   * Register new user
   */
  static async register(
    email: string,
    password: string,
    name?: string,
    keitaroSubId?: string
  ): Promise<{ user: any; token: string }> {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const hashedPassword = await this.hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        keitaroSubId,
        registrationSource: keitaroSubId ? 'paid_traffic' : 'organic'
      }
    });

    // Create session
    const token = await this.createSession(user.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token
    };
  }

  /**
   * Login user
   */
  static async login(email: string, password: string): Promise<{ user: any; token: string }> {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Create session
    const token = await this.createSession(user.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token
    };
  }

  /**
   * Logout user
   */
  static async logout(token: string): Promise<void> {
    await prisma.session.delete({
      where: { token }
    });
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return null;
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

/**
 * Authentication middleware
 */
export function authenticate(required: boolean = true) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Get token from header or cookie
      const token = req.headers.authorization?.replace('Bearer ', '') || 
                   req.cookies?.token;

      if (!token) {
        if (required) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        return next();
      }

      // Validate session
      const payload = await AuthService.validateSession(token);
      if (!payload) {
        if (required) {
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
        return next();
      }

      // Attach user to request
      req.user = payload;
      next();
    } catch (error) {
      logger.error('Authentication error', error);
      if (required) {
        return res.status(401).json({ error: 'Authentication failed' });
      }
      next();
    }
  };
}

/**
 * Check if user has active subscription
 */
export async function requireSubscription(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId }
  });

  if (!user || user.subscriptionStatus !== 'active') {
    return res.status(403).json({ error: 'Active subscription required' });
  }

  next();
}
