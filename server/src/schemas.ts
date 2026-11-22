import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email('Invalid email address').max(255);

export const passwordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must include a letter and a digit');

export const registerBody = z.object({
  email,
  password: passwordPolicy,
});

export const loginBody = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const triggerAddBody = z.object({
  triggerId: z.string().uuid('triggerId must be a UUID'),
});

export const playbookBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  triggerId: z.string().uuid('triggerId must be a UUID'),
  actionIds: z
    .array(z.string().uuid('Action id must be a UUID'))
    .min(1, 'Choose at least one action')
    .max(3, 'Choose at most three actions')
    .refine((ids) => new Set(ids).size === ids.length, 'Action ids must be distinct'),
});

export const idParam = z.object({
  id: z.string().min(1),
});

export const simulateBody = z.object({
  triggerId: z.string().uuid('triggerId must be a UUID'),
});

export type RegisterBody = z.infer<typeof registerBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type TriggerAddBody = z.infer<typeof triggerAddBody>;
export type PlaybookBody = z.infer<typeof playbookBody>;
export type SimulateBody = z.infer<typeof simulateBody>;
