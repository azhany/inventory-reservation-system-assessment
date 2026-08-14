export type ReservationStatus =
  | 'ACTIVE'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

export type Reservation = Readonly<{
  cancelledAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  productId: string;
  status: ReservationStatus;
  userId: string;
}>;
