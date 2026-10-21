import os
import unittest

os.environ.setdefault("ADMIN_PASSWORD", "test-password")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ["DATABASE_URL"] = "sqlite://"

import jwt
from fastapi import HTTPException, Response
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

import main


class AccountUpdateTest(unittest.TestCase):
    def setUp(self):
        self.limiter_was_enabled = main.limiter.enabled
        main.limiter.enabled = False
        self.engine = create_engine("sqlite://")
        main.Base.metadata.create_all(self.engine)
        self.session = Session(self.engine, expire_on_commit=False)
        self.user = main.User(
            username="admin",
            hashed_password=main.password_hash.hash("senha-atual-123"),
        )
        self.session.add(self.user)
        self.session.commit()

    def tearDown(self):
        main.limiter.enabled = self.limiter_was_enabled
        self.session.close()
        self.engine.dispose()

    def payload(self, **overrides):
        data = {
            "current_password": "senha-atual-123",
            "username": "admin",
        }
        data.update(overrides)
        return main.AccountUpdateInput(**data)

    def cookie_username(self, response: Response) -> str | None:
        header = response.headers.get("set-cookie")
        if not header or f"{main.AUTH_COOKIE}=" not in header:
            return None
        token = header.split(f"{main.AUTH_COOKIE}=", 1)[1].split(";", 1)[0]
        return jwt.decode(token, main.JWT_SECRET, algorithms=["HS256"]).get("sub")

    def test_rejects_wrong_current_password(self):
        with self.assertRaises(HTTPException) as caught:
            main.update_current_user(
                None,
                self.payload(current_password="senha-errada"),
                Response(),
                self.session,
                self.user,
            )
        self.assertEqual(caught.exception.status_code, 401)
        self.assertTrue(
            main.password_hash.verify("senha-atual-123", self.user.hashed_password)
        )

    def test_changes_password(self):
        response = Response()
        result = main.update_current_user(
            None,
            self.payload(new_password="nova-senha-456"),
            response,
            self.session,
            self.user,
        )

        self.assertEqual(result.username, "admin")
        self.assertTrue(main.password_hash.verify("nova-senha-456", self.user.hashed_password))
        self.assertFalse(main.password_hash.verify("senha-atual-123", self.user.hashed_password))
        self.assertIsNone(self.cookie_username(response))

    def test_renames_user_and_reissues_cookie(self):
        response = Response()
        result = main.update_current_user(
            None,
            self.payload(username="operador"),
            response,
            self.session,
            self.user,
        )

        self.assertEqual(result.username, "operador")
        self.assertEqual(self.user.username, "operador")
        self.assertEqual(self.cookie_username(response), "operador")

    def test_rejects_username_already_taken(self):
        self.session.add(
            main.User(username="outro", hashed_password=main.password_hash.hash("outra-senha"))
        )
        self.session.commit()

        with self.assertRaises(HTTPException) as caught:
            main.update_current_user(
                None,
                self.payload(username="outro", new_password="nova-senha-456"),
                Response(),
                self.session,
                self.user,
            )
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(self.user.username, "admin")

    def test_rejects_empty_update(self):
        with self.assertRaises(HTTPException) as caught:
            main.update_current_user(
                None, self.payload(), Response(), self.session, self.user
            )
        self.assertEqual(caught.exception.status_code, 422)

    def test_rejects_repeated_password(self):
        with self.assertRaises(HTTPException) as caught:
            main.update_current_user(
                None,
                self.payload(new_password="senha-atual-123"),
                Response(),
                self.session,
                self.user,
            )
        self.assertEqual(caught.exception.status_code, 422)

    def test_short_new_password_fails_validation(self):
        with self.assertRaises(ValidationError):
            self.payload(new_password="curta")


class RateLimitKeyTest(unittest.TestCase):
    def make_request(self, headers=(), client=("203.0.113.5", 40000)):
        return Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/auth/login",
                "headers": list(headers),
                "client": client,
            }
        )

    def test_key_uses_first_forwarded_for(self):
        request = self.make_request(
            headers=[(b"x-forwarded-for", b"198.51.100.9, 10.0.0.2")]
        )
        self.assertEqual(main.rate_limit_client(request), "198.51.100.9")

    def test_key_falls_back_to_client_host(self):
        self.assertEqual(main.rate_limit_client(self.make_request()), "203.0.113.5")


if __name__ == "__main__":
    unittest.main()
