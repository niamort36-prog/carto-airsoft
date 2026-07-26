import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SupabaseTokenService } from './supabase-token.service';

@Module({
  providers: [SupabaseTokenService, SupabaseAuthGuard],
  exports: [SupabaseTokenService, SupabaseAuthGuard],
})
export class AuthModule {}
